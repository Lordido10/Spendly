"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const code = fs.readFileSync(path.join(root, "script.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
const KEY = "spendly:data";
const income = (id=1,amount=100) => ({id,name:"Work",amount,category:"Gift",date:"2026-09-01"});
const expense = (id=2,amount=20) => ({id,name:"Lunch",amount,category:"Food",date:"2026-09-01",reason:"Campus"});
const original = () => ({balance:80,totalIncome:100,dailyLimit:50,income:[income()],expenses:[expense()],goals:[],lastId:2});

function boot(raw = null, options = {}) {
    const storage = options.storage || new Map(raw === null ? [] : [[KEY, raw]]);
    const elements = Object.fromEntries(ids.map(id => [id, {
        value:"", textContent:"", innerHTML:"", hidden:true, style:{},
        classList:{remove(){},toggle(){}}, listeners:{},
        addEventListener(name, fn){this.listeners[name]=fn;},
        focus(){}, reset(){}, querySelectorAll(){return [];}
    }]));
    for (const type of ["income","expense"]) {
        elements[type+"-category-filter"].value="all";
        elements[type+"-sort"].value="newest";
    }
    const context = vm.createContext({
        document:{getElementById:id=>elements[id],querySelectorAll:()=>[],addEventListener(){},activeElement:null},
        localStorage:{
            getItem(key){if(options.failRead) throw Error("Read unavailable");return storage.get(key) ?? null;},
            setItem(key,value){if(options.failWrite || (options.failMainWrite && key===KEY)) throw Error("Quota");storage.set(key,value);}
        },
        console:{warn(){}}, setTimeout:()=>0, clearTimeout(){}
    });
    vm.runInContext(code, context);
    const run = source => vm.runInContext(source, context);
    return {run,storage,elements,options,
        state:()=>JSON.parse(run("JSON.stringify(state)")),
        form(values){for(const [key,value] of Object.entries(values)) elements[key].value=value;},
        action(name,id){run("modalContext="+JSON.stringify(id ?? null));return run("runStateAction("+name+")");},
        backups:()=>[...storage.entries()].filter(([key])=>key.startsWith(KEY+":backup:")),
        reload:()=>boot(null,{storage})
    };
}

test("static selectors exist and HTML IDs are unique",()=>{
    assert.equal(new Set(ids).size,ids.length);
    for(const match of code.matchAll(/\$\("([^"]+)"\)/g)) assert(ids.includes(match[1]),match[1]);
});

test("legacy migration backs up exact source and is idempotent",()=>{
    const raw=JSON.stringify(original()); const app=boot(raw);
    assert.equal(app.backups()[0][1],raw);
    assert.equal(app.run("recoveryRequired"),false);
    assert.equal(app.state().balance,80);
    assert.equal(app.state().historyIncomplete,false);
    assert.equal(JSON.parse(app.storage.get(KEY)).schemaVersion,1);
    assert.deepEqual(app.reload().state(),app.state());
    assert.equal(app.backups().length,1);
});

test("historical total without invented income survives edits and reload",()=>{
    const app=boot(JSON.stringify({balance:75000,totalIncome:100000,expenses:[expense(1,25000)],goals:[]}));
    assert.equal(app.state().totalIncome,100000);
    assert.equal(app.state().income.length,0);
    assert.equal(app.state().legacyIncome,100000);
    assert.equal(app.state().openingBalanceAdjustment,0);
    app.form({"income-name":"New","income-amount":"1000","income-category":"Gift","income-date":"2026-09-02"});
    assert.equal(app.action("submitAddIncome"),true);
    assert.equal(app.reload().state().totalIncome,101000);
    assert.equal(app.state().balance,76000);
    assert.equal(app.run("sumAmount(getMonthIncome())"),new Date().getFullYear()===2026 && new Date().getMonth()===8 ? 1000:0);
});

test("unexplained legacy balance is explicit, preserved, and never fabricated as a transaction",()=>{
    const app=boot(JSON.stringify({...original(),balance:90}));
    assert.equal(app.state().openingBalanceAdjustment,10);
    assert.equal(app.state().historyIncomplete,true);
    assert.equal(app.state().income.length,1);
    assert.equal(app.reload().state().balance,90);
});

test("corrupt, unsupported, and invalid saves are never overwritten or partially loaded",()=>{
    const bad=["", "{broken", "null", "[]", JSON.stringify({schemaVersion:99}),
        JSON.stringify({...original(),income:[{...income(),amount:-1}]}),
        JSON.stringify({...original(),expenses:[{...expense(),reason:123}]}),
        JSON.stringify({...original(),expenses:[{...expense(),date:"2026-02-30"}]}),
        JSON.stringify({...original(),goals:[{id:3,name:"Goal",target:0,saved:0}]}),
        JSON.stringify({...original(),income:null})];
    for(const raw of bad){
        const app=boot(raw);
        assert.equal(app.storage.get(KEY),raw);
        assert.equal(app.run("recoveryRequired"),true);
        assert.equal(app.state().income.length,0);
        assert.equal(app.action("submitAddIncome"),false);
        assert.equal(app.storage.get(KEY),raw);
        assert.equal(app.backups()[0][1],raw);
    }
});

test("backup or read failures block migration and reset without erasing original",()=>{
    for(const options of [{failWrite:true},{failRead:true}]){
        const raw=JSON.stringify(original());const app=boot(raw,options);
        assert.equal(app.run("recoveryRequired"),true);
        assert.equal(app.action("submitResetData"),false);
        assert.equal(app.storage.get(KEY),raw);
    }
});

test("explicit reset after failed load retains recovery backup",()=>{
    const app=boot("{broken");assert.equal(app.action("submitResetData"),true);
    assert.equal(app.run("recoveryRequired"),false);
    assert.equal(app.backups()[0][1],"{broken");
    assert.equal(app.reload().state().balance,0);
});

test("duplicate IDs and stale/missing counters are recovered without losing records",()=>{
    for(const lastId of [undefined,0,-1,1.5]){
        const app=boot(JSON.stringify({...original(),lastId,income:[income(1,50),income(1,50)],expenses:[expense(1,20)]}));
        const items=[...app.state().income,...app.state().expenses];
        assert.equal(new Set(items.map(item=>item.id)).size,3);
        assert.equal(app.state().balance,80);
        assert(!items.some(item=>item.id===app.run("createId()")));
    }
    const app=boot(JSON.stringify({...original(),lastId:Number.MAX_SAFE_INTEGER}));
    assert.equal(app.run("createId()"),3);
});

test("strict money/date/category/name validation",()=>{
    const app=boot();
    for(const value of ["-5000","abc123","1.25","1e5","Infinity","9".repeat(309),"9007199254740992",""]){
        assert.equal(app.run("Number.isNaN(parseRupiah("+JSON.stringify(value)+"))"),true,value);
    }
    assert.equal(app.run('parseRupiah("Rp 25.000")'),25000);
    assert.equal(app.run('formatWhileTyping("-5000")'),"-5000");
    assert.equal(app.run('formatWhileTyping("Rp 1.0000", "insertText", "0")'),"Rp 10.000");
    for(const date of ["nonsense","2026-02-30","2026-13-01","2026-00-01"]) assert.equal(app.run('isValidDate('+JSON.stringify(date)+')'),false);
    assert.equal(app.run('isValidDate("2024-02-29")'),true);
    assert.equal(app.run('isValidDate("2026-09-01T12:00:00.000Z")'),true);
    for(const fields of [{"income-name":" "},{"income-category":"Bogus"},{"income-date":"2026-02-30"},{"income-amount":"-50"}]){
        app.form({"income-name":"Work","income-category":"Gift","income-date":"2026-09-01","income-amount":"50",...fields});
        const before=app.storage.get(KEY);
        assert.equal(app.action("submitAddIncome"),false);
        assert.equal(app.storage.get(KEY),before);
        assert.equal(app.state().income.length,0);
        assert.equal(app.run("lastId"),0);
    }
});

test("aggregate overflow rolls back state, IDs, and persisted data",()=>{
    const app=boot(JSON.stringify({...original(),balance:Number.MAX_SAFE_INTEGER,totalIncome:Number.MAX_SAFE_INTEGER,income:[income(1,Number.MAX_SAFE_INTEGER)],expenses:[]}));
    const before=app.storage.get(KEY);
    app.form({"income-name":"Overflow","income-amount":"1","income-category":"Gift"});
    assert.equal(app.action("submitAddIncome"),false);
    assert.equal(app.storage.get(KEY),before);
    assert.equal(app.state().balance,Number.MAX_SAFE_INTEGER);
    assert.equal(app.state().income.length,1);
});

test("versioned accounting mismatch is blocked, not silently reconciled",()=>{
    const app=boot(JSON.stringify(original()));
    const saved=JSON.parse(app.storage.get(KEY));saved.balance++;
    const raw=JSON.stringify(saved);const broken=boot(raw);
    assert.equal(broken.run("recoveryRequired"),true);
    assert.equal(broken.storage.get(KEY),raw);
});

test("income/expense delta operations and savings preserve the accounting equation across reload",()=>{
    const app=boot();
    app.form({"income-name":"Work","income-amount":"100000","income-category":"Gift"});
    assert.equal(app.action("submitAddIncome"),true);
    app.form({"edit-income-name":"Work","edit-income-amount":"120000","edit-income-category":"Gift"});
    assert.equal(app.action("submitEditIncome",1),true);assert.equal(app.state().balance,120000);
    app.form({"expense-name":"Lunch","expense-amount":"30000","expense-category":"Food"});
    assert.equal(app.action("submitAddExpense"),true);assert.equal(app.state().balance,90000);
    app.form({"edit-expense-name":"Lunch","edit-expense-amount":"40000","edit-expense-category":"Food","edit-expense-reason":"Campus"});
    assert.equal(app.action("submitEditExpense",2),true);assert.equal(app.state().balance,80000);
    assert.deepEqual(app.reload().state(),app.state());
    app.form({"goal-name":"Book","goal-target":"50000"});assert.equal(app.action("submitAddGoal"),true);
    app.form({"savings-amount":"20000"});assert.equal(app.action("submitAddSavings",3),true);
    assert.equal(app.state().balance,60000);assert.equal(app.state().goals[0].saved,20000);
    assert.deepEqual(app.reload().state(),app.state());
    assert.equal(app.action("submitDeleteExpense",2),true);assert.equal(app.state().balance,100000);
    assert.equal(app.action("submitDeleteIncome",1),false);
    app.form({"edit-income-name":"Work","edit-income-amount":"100000","edit-income-category":"Gift"});
    assert.equal(app.action("submitEditIncome",1),true);assert.equal(app.state().balance,80000);
    app.action("submitResetData");assert.equal(app.reload().state().legacyIncome,0);
});

test("existing search/filter/sort, daily reason, monthly totals and event wiring remain functional",()=>{
    const app=boot(JSON.stringify(original()));
    assert.equal(app.run('searchExpenses(state.expenses,"campus").length'),1);
    assert.equal(app.run('searchIncome(state.income,"gift").length'),1);
    assert.equal(app.run('filterByCategory(state.expenses,"Food").length'),1);
    assert.equal(app.run('filterIncomeByMonth(state.income,"2026-09").length'),1);
    for(const fn of ["sortIncome","sortExpenses"]){
        for(const mode of ["newest","oldest","highest","lowest"]){
            const result=app.run(fn+'([{id:1,date:"2026-01-01",amount:1},{id:2,date:"2026-02-01",amount:2}],"'+mode+'")[0].id');
            assert.equal(result,["newest","highest"].includes(mode)?2:1);
        }
    }
    app.form({"expense-name":"Today","expense-amount":"60","expense-category":"Food"});
    app.run('activeModal="addExpense"');
    app.elements["modal-form"].listeners.submit({preventDefault(){}});
    assert.equal(app.run("activeModal"),"reason");
    assert.equal(app.state().balance,20);
    app.run("cancelModal()");assert.equal(app.state().expenses[1].reason,"No reason given");
    assert.deepEqual(app.reload().state(),app.state());
});

test("income deletion succeeds after expense refund and survives reload",()=>{
    const app=boot(JSON.stringify(original()));
    assert.equal(app.action("submitDeleteExpense",2),true);
    assert.equal(app.state().balance,100);
    assert.equal(app.action("submitDeleteIncome",1),true);
    assert.equal(app.state().balance,0);
    assert.equal(app.reload().state().income.length,0);
});

test("all amount-entry actions reject unsafe or negative values without writes",()=>{
    const app=boot(JSON.stringify({...original(),goals:[{id:3,name:"Book",target:100,saved:0}]}));
    const cases=[
        ["submitAddIncome","income-amount",null,{"income-name":"Work","income-category":"Gift"}],
        ["submitEditIncome","edit-income-amount",1,{"edit-income-name":"Work","edit-income-category":"Gift"}],
        ["submitAddExpense","expense-amount",null,{"expense-name":"Food","expense-category":"Food"}],
        ["submitEditExpense","edit-expense-amount",2,{"edit-expense-name":"Food","edit-expense-category":"Food"}],
        ["submitSetLimit","limit-amount",null,{}],
        ["submitAddGoal","goal-target",null,{"goal-name":"Book"}],
        ["submitAddSavings","savings-amount",3,{}]
    ];
    for(const [action,field,id,values] of cases){
        for(const amount of ["-50","0","abc5","9".repeat(309)]){
            app.form({...values,[field]:amount});
            const before=app.storage.get(KEY);
            assert.equal(app.action(action,id),false,action+" "+amount);
            assert.equal(app.storage.get(KEY),before);
        }
    }
});

test("partial historical income is retained separately and backups never collide",()=>{
    const raw=JSON.stringify({...original(),balance:180,totalIncome:200});
    const app=boot(raw);
    assert.equal(app.state().legacyIncome,100);
    assert.equal(app.state().openingBalanceAdjustment,0);
    assert.equal(app.state().income.length,1);
    app.run('backupRaw("first"); backupRaw("second")');
    assert.equal(app.backups().length,3);
    assert.deepEqual(app.backups().map(([,value])=>value),[raw,"first","second"]);
    assert.deepEqual(app.reload().state(),app.state());
});

function withdrawalFixture() {
    return boot(JSON.stringify({...original(),balance:30,goals:[
        {id:3,name:"Book",target:30,saved:30},
        {id:4,name:"Laptop",target:100,saved:20}
    ]}));
}

test("withdrawal: small and full amounts persist without changing transactions or other goals",()=>{
    const app=withdrawalFixture();const before=app.state();
    app.form({"withdrawal-amount":"1"});
    assert.equal(app.action("submitWithdrawSavings",3),true);
    assert.equal(app.state().balance,31);assert.equal(app.state().goals[0].saved,29);
    assert.deepEqual(app.state().income,before.income);assert.deepEqual(app.state().expenses,before.expenses);
    assert.deepEqual(app.state().goals[1],before.goals[1]);
    assert.equal(app.state().totalIncome,before.totalIncome);
    assert.deepEqual(app.reload().state(),app.state());
    app.form({"withdrawal-amount":"29"});assert.equal(app.action("submitWithdrawSavings",3),true);
    assert.equal(app.state().balance,60);assert.equal(app.state().goals[0].saved,0);
    assert.deepEqual(app.reload().state(),app.state());
    assert.match(app.elements['toast'].textContent,/withdrawn/);
});

test("withdrawal: multiple goals remain independent and accounting stays valid",()=>{
    const app=withdrawalFixture();
    for(const [id,amount] of [[3,"10"],[4,"20"],[3,"20"]]){
        app.form({"withdrawal-amount":amount});assert.equal(app.action("submitWithdrawSavings",id),true);
        assert.doesNotThrow(()=>app.run('validateState(state)'));
    }
    assert.equal(app.state().balance,80);
    assert.deepEqual(app.state().goals.map(goal=>goal.saved),[0,0]);
    assert.deepEqual(app.reload().state(),app.state());
});

test("withdrawal: invalid, excessive and empty-goal requests make no changes",()=>{
    const app=withdrawalFixture();const before=app.state();const saved=app.storage.get(KEY);
    for(const value of ["0","-1","31","","abc","NaN","Infinity","1.5","9007199254740992","9".repeat(309)]){
        app.form({"withdrawal-amount":value});assert.equal(app.action("submitWithdrawSavings",3),false,value);
        assert.deepEqual(app.state(),before);assert.equal(app.storage.get(KEY),saved);
        assert.equal(app.elements['modal-error'].hidden,false);
    }
    app.form({"withdrawal-amount":"30"});app.action("submitWithdrawSavings",3);
    app.form({"withdrawal-amount":"1"});assert.equal(app.action("submitWithdrawSavings",3),false);
    assert.equal(app.state().goals[0].saved,0);
});

test("withdrawal: missing goals, recovery mode and invalid accounting cannot commit",()=>{
    const app=withdrawalFixture();app.form({"withdrawal-amount":"1"});
    const saved=app.storage.get(KEY);assert.equal(app.action("submitWithdrawSavings",999),false);
    assert.equal(app.storage.get(KEY),saved);
    app.run('state.balance += 1');const before=app.state();
    assert.equal(app.action("submitWithdrawSavings",3),false);assert.deepEqual(app.state(),before);
    assert.equal(app.storage.get(KEY),saved);
    const corrupt=boot('{broken');corrupt.form({"withdrawal-amount":"1"});
    assert.equal(corrupt.action("submitWithdrawSavings",3),false);assert.equal(corrupt.storage.get(KEY),'{broken');
});

test("withdrawal: completed goals expose the action and modal submit uses integrity wrapper",()=>{
    const app=withdrawalFixture();assert.match(app.elements['goal-list'].innerHTML,/data-withdraw-savings="3"/);
    app.run('openModal("withdrawSavings",3)');
    assert.match(app.elements['modal-description'].textContent,/Rp 30 available/);
    app.form({"withdrawal-amount":"10"});
    app.elements['modal-form'].listeners.submit({preventDefault(){}});
    assert.equal(app.state().balance,40);assert.equal(app.state().goals[0].saved,20);
    assert.equal(app.elements['modal-overlay'].hidden,true);
    assert.deepEqual(app.reload().state(),app.state());
});

test("withdrawal: safe-integer boundary transfers exactly and overflow is rejected",()=>{
    const max=Number.MAX_SAFE_INTEGER;
    const app=boot(JSON.stringify({balance:max-1,totalIncome:max,dailyLimit:0,
        income:[income(1,max)],expenses:[],goals:[{id:2,name:"Boundary",target:1,saved:1}],lastId:2}));
    app.form({"withdrawal-amount":"1"});
    assert.equal(app.action("submitWithdrawSavings",2),true);
    assert.equal(app.state().balance,max);assert.equal(app.state().goals[0].saved,0);
    assert.deepEqual(app.reload().state(),app.state());
    app.run('state.goals[0].saved = 1');
    const before=app.state();const saved=app.storage.get(KEY);
    assert.equal(app.action("submitWithdrawSavings",2),false);
    assert.deepEqual(app.state(),before);assert.equal(app.storage.get(KEY),saved);
    assert.match(app.elements['modal-error'].textContent,/safe whole-rupiah range/);
});

test("save failure: saveState returns explicit success, failure and blocked results",()=>{
    const app=boot(JSON.stringify(original()));assert.equal(app.run('saveState()'),true);
    const saved=app.storage.get(KEY);const state=app.state();app.options.failWrite=true;
    assert.equal(app.run('saveState()'),false);
    assert.equal(app.storage.get(KEY),saved);assert.deepEqual(app.state(),state);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    assert.equal(app.elements['retry-save'].hidden,false);
    app.run('actionInProgress=true');assert.equal(app.run('saveState()'),false);
    const broken=boot('{broken');assert.equal(broken.run('saveState()'),false);
    assert.equal(broken.storage.get(KEY),'{broken');
});

test("save failure: valid action remains in memory, old save intact, no false success",()=>{
    const app=boot(JSON.stringify(original()));const saved=app.storage.get(KEY);
    app.run('showToast("Previous success")');app.options.failWrite=true;
    app.form({'income-name':'Unsaved income','income-amount':'20','income-category':'Gift'});
    app.run('activeModal="addIncome"');
    app.elements['modal-form'].listeners.submit({preventDefault(){}});
    assert.equal(app.state().balance,100);assert.equal(app.state().income.length,2);
    assert.equal(app.storage.get(KEY),saved);
    assert.equal(app.elements['toast'].hidden,true);assert.equal(app.elements['toast'].textContent,'');
    assert.equal(app.elements['modal-overlay'].hidden,true);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    assert.equal(app.reload().state().balance,80);
});

test("save failure: retry persists once without replaying action and clears notice only on success",()=>{
    const app=withdrawalFixture();const saved=app.storage.get(KEY);app.options.failWrite=true;
    app.form({'withdrawal-amount':'10'});assert.equal(app.action('submitWithdrawSavings',3),true);
    assert.equal(app.state().balance,40);assert.equal(app.state().goals[0].saved,20);
    app.elements['retry-save'].listeners.click();
    assert.equal(app.storage.get(KEY),saved);assert.equal(app.elements['save-failure-notice'].hidden,false);
    assert.equal(app.elements['toast'].hidden,true);
    app.options.failWrite=false;app.elements['retry-save'].listeners.click();
    assert.equal(app.state().balance,40);assert.equal(app.state().goals[0].saved,20);
    assert.deepEqual(app.reload().state(),app.state());
    assert.equal(app.elements['save-failure-notice'].hidden,true);
    assert.equal(app.elements['retry-save'].hidden,true);
    assert.equal(app.elements['toast'].textContent,'Your changes have been saved.');
});

test("save failure: a later successful action saves all retained changes",()=>{
    const app=withdrawalFixture();app.options.failWrite=true;
    app.form({'withdrawal-amount':'5'});app.action('submitWithdrawSavings',3);
    app.options.failWrite=false;app.form({'withdrawal-amount':'5'});app.action('submitWithdrawSavings',4);
    assert.equal(app.state().balance,40);
    assert.deepEqual(app.reload().state(),app.state());
    assert.equal(app.elements['save-failure-notice'].hidden,true);
    assert.match(app.elements['toast'].textContent,/withdrawn/);
});

test("save failure: failed migration commit preserves source and backup, never defaults",()=>{
    const raw=JSON.stringify(original());
    const app=boot(raw,{failMainWrite:true});
    assert.equal(app.storage.get(KEY),raw);assert.equal(app.backups()[0][1],raw);
    assert.equal(app.state().balance,80);assert.equal(app.state().income.length,1);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    app.options.failMainWrite=false;app.run('retrySave()');
    assert.equal(JSON.parse(app.storage.get(KEY)).schemaVersion,1);
    assert.deepEqual(app.reload().state(),app.state());
});

test("save failure: invalid actions still roll back while unsaved state is retained",()=>{
    const app=withdrawalFixture();app.options.failWrite=true;
    app.form({'withdrawal-amount':'1'});app.action('submitWithdrawSavings',3);
    const before=app.state();const saved=app.storage.get(KEY);
    app.form({'income-name':'Bad','income-category':'Invalid','income-amount':'5'});
    assert.equal(app.action('submitAddIncome'),false);assert.deepEqual(app.state(),before);
    assert.equal(app.storage.get(KEY),saved);assert.equal(app.elements['save-failure-notice'].hidden,false);
    app.run('state.balance++');assert.throws(()=>app.run('saveState()'),/accounting/);
    assert.equal(app.storage.get(KEY),saved);
});

test("save failure: reset is not falsely reported saved and original persisted state remains",()=>{
    const app=boot(JSON.stringify(original()));const saved=app.storage.get(KEY);app.options.failWrite=true;
    assert.equal(app.action('submitResetData'),true);
    assert.equal(app.state().balance,0);assert.equal(app.storage.get(KEY),saved);
    assert.equal(app.elements['toast'].hidden,true);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    app.options.failWrite=false;app.run('retrySave()');assert.equal(app.reload().state().balance,0);
});
