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

const lockQueues = new WeakMap();

async function boot(raw = null, options = {}) {
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
    const events = {};
    const storageAPI = {
        getItem(key){if(options.failRead) throw Error("Read unavailable");return storage.get(key) ?? null;},
        setItem(key,value){if(options.failWrite || (options.failMainWrite && key===KEY)) throw Error("Quota");storage.set(key,value);}
    };
    const context = vm.createContext({
        crypto:require('node:crypto'),
        window:{addEventListener(name,fn){events[name]=fn;}},
        navigator:{locks:options.noLocks ? undefined : {request(name,fn){
            const pending=(lockQueues.get(storage)||Promise.resolve()).then(fn);
            lockQueues.set(storage,pending.catch(()=>{}));return pending;
        }}},
        document:{getElementById:id=>elements[id],querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},activeElement:null},
        localStorage:storageAPI,
        console:{warn(){}}, setTimeout:()=>0, clearTimeout(){}
    });
    vm.runInContext(code, context);
    const run = source => vm.runInContext(source, context);
    await run("startup");
    return {run,storage,elements,options,
        external(key=KEY){return events.storage({key,storageArea:storageAPI});},
        state:()=>JSON.parse(run("JSON.stringify(state)")),
        form(values){for(const [key,value] of Object.entries(values)) elements[key].value=value;},
        action(name,id){run("modalContext="+JSON.stringify(id ?? null));return run("runStateAction("+name+")");},
        backups:()=>[...storage.entries()].filter(([key])=>key.startsWith(KEY+":backup:")),
        reload:()=>boot(null,{storage})
    };
}

test("static selectors exist and HTML IDs are unique",async()=>{
    assert.equal(new Set(ids).size,ids.length);
    for(const match of code.matchAll(/\$\("([^"]+)"\)/g)) assert(ids.includes(match[1]),match[1]);
});

test("legacy migration backs up exact source and is idempotent",async()=>{
    const raw=JSON.stringify(original()); const app=await boot(raw);
    assert.equal(app.backups()[0][1],raw);
    assert.equal(app.run("recoveryRequired"),false);
    assert.equal(app.state().balance,80);
    assert.equal(app.state().historyIncomplete,false);
    assert.equal(JSON.parse(app.storage.get(KEY)).schemaVersion,1);
    assert.deepEqual((await app.reload()).state(),app.state());
    assert.equal(app.backups().length,1);
});

test("historical total without invented income survives edits and reload",async()=>{
    const app=await boot(JSON.stringify({balance:75000,totalIncome:100000,expenses:[expense(1,25000)],goals:[]}));
    assert.equal(app.state().totalIncome,100000);
    assert.equal(app.state().income.length,0);
    assert.equal(app.state().legacyIncome,100000);
    assert.equal(app.state().openingBalanceAdjustment,0);
    app.form({"income-name":"New","income-amount":"1000","income-category":"Gift","income-date":"2026-09-02"});
    assert.equal(await app.action("submitAddIncome"),true);
    assert.equal((await app.reload()).state().totalIncome,101000);
    assert.equal(app.state().balance,76000);
    assert.equal(app.run("sumAmount(getMonthIncome())"),new Date().getFullYear()===2026 && new Date().getMonth()===8 ? 1000:0);
});

test("unexplained legacy balance is explicit, preserved, and never fabricated as a transaction",async()=>{
    const app=await boot(JSON.stringify({...original(),balance:90}));
    assert.equal(app.state().openingBalanceAdjustment,10);
    assert.equal(app.state().historyIncomplete,true);
    assert.equal(app.state().income.length,1);
    assert.equal((await app.reload()).state().balance,90);
});

test("corrupt, unsupported, and invalid saves are never overwritten or partially loaded",async()=>{
    const bad=["", "{broken", "null", "[]", JSON.stringify({schemaVersion:99}),
        JSON.stringify({...original(),income:[{...income(),amount:-1}]}),
        JSON.stringify({...original(),expenses:[{...expense(),reason:123}]}),
        JSON.stringify({...original(),expenses:[{...expense(),date:"2026-02-30"}]}),
        JSON.stringify({...original(),goals:[{id:3,name:"Goal",target:0,saved:0}]}),
        JSON.stringify({...original(),income:null})];
    for(const raw of bad){
        const app=await boot(raw);
        assert.equal(app.storage.get(KEY),raw);
        assert.equal(app.run("recoveryRequired"),true);
        assert.equal(app.state().income.length,0);
        assert.equal(await app.action("submitAddIncome"),false);
        assert.equal(app.storage.get(KEY),raw);
        assert.equal(app.backups()[0][1],raw);
    }
});

test("backup or read failures block migration and reset without erasing original",async()=>{
    for(const options of [{failWrite:true},{failRead:true}]){
        const raw=JSON.stringify(original());const app=await boot(raw,options);
        assert.equal(app.run("recoveryRequired"),true);
        assert.equal(await app.action("submitResetData"),false);
        assert.equal(app.storage.get(KEY),raw);
    }
});

test("explicit reset after failed load retains recovery backup",async()=>{
    const app=await boot("{broken");assert.equal(await app.action("submitResetData"),true);
    assert.equal(app.run("recoveryRequired"),false);
    assert.equal(app.backups()[0][1],"{broken");
    assert.equal((await app.reload()).state().balance,0);
});

test("duplicate IDs and stale/missing counters are recovered without losing records",async()=>{
    for(const lastId of [undefined,0,-1,1.5]){
        const app=await boot(JSON.stringify({...original(),lastId,income:[income(1,50),income(1,50)],expenses:[expense(1,20)]}));
        const items=[...app.state().income,...app.state().expenses];
        assert.equal(new Set(items.map(item=>item.id)).size,3);
        assert.equal(app.state().balance,80);
        assert(!items.some(item=>item.id===app.run("createId()")));
    }
    const app=await boot(JSON.stringify({...original(),lastId:Number.MAX_SAFE_INTEGER}));
    assert.equal(app.run("createId()"),3);
});

test("strict money/date/category/name validation",async()=>{
    const app=await boot();
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
        assert.equal(await app.action("submitAddIncome"),false);
        assert.equal(app.storage.get(KEY),before);
        assert.equal(app.state().income.length,0);
        assert.equal(app.run("lastId"),0);
    }
});

test("aggregate overflow rolls back state, IDs, and persisted data",async()=>{
    const app=await boot(JSON.stringify({...original(),balance:Number.MAX_SAFE_INTEGER,totalIncome:Number.MAX_SAFE_INTEGER,income:[income(1,Number.MAX_SAFE_INTEGER)],expenses:[]}));
    const before=app.storage.get(KEY);
    app.form({"income-name":"Overflow","income-amount":"1","income-category":"Gift"});
    assert.equal(await app.action("submitAddIncome"),false);
    assert.equal(app.storage.get(KEY),before);
    assert.equal(app.state().balance,Number.MAX_SAFE_INTEGER);
    assert.equal(app.state().income.length,1);
});

test("versioned accounting mismatch is blocked, not silently reconciled",async()=>{
    const app=await boot(JSON.stringify(original()));
    const saved=JSON.parse(app.storage.get(KEY));saved.balance++;
    const raw=JSON.stringify(saved);const broken=await boot(raw);
    assert.equal(broken.run("recoveryRequired"),true);
    assert.equal(broken.storage.get(KEY),raw);
});

test("income/expense delta operations and savings preserve the accounting equation across reload",async()=>{
    const app=await boot();
    app.form({"income-name":"Work","income-amount":"100000","income-category":"Gift"});
    assert.equal(await app.action("submitAddIncome"),true);
    app.form({"edit-income-name":"Work","edit-income-amount":"120000","edit-income-category":"Gift"});
    assert.equal(await app.action("submitEditIncome",1),true);assert.equal(app.state().balance,120000);
    app.form({"expense-name":"Lunch","expense-amount":"30000","expense-category":"Food"});
    assert.equal(await app.action("submitAddExpense"),true);assert.equal(app.state().balance,90000);
    app.form({"edit-expense-name":"Lunch","edit-expense-amount":"40000","edit-expense-category":"Food","edit-expense-reason":"Campus"});
    assert.equal(await app.action("submitEditExpense",2),true);assert.equal(app.state().balance,80000);
    assert.deepEqual((await app.reload()).state(),app.state());
    app.form({"goal-name":"Book","goal-target":"50000"});assert.equal(await app.action("submitAddGoal"),true);
    app.form({"savings-amount":"20000"});assert.equal(await app.action("submitAddSavings",3),true);
    assert.equal(app.state().balance,60000);assert.equal(app.state().goals[0].saved,20000);
    assert.deepEqual((await app.reload()).state(),app.state());
    assert.equal(await app.action("submitDeleteExpense",2),true);assert.equal(app.state().balance,100000);
    assert.equal(await app.action("submitDeleteIncome",1),false);
    app.form({"edit-income-name":"Work","edit-income-amount":"100000","edit-income-category":"Gift"});
    assert.equal(await app.action("submitEditIncome",1),true);assert.equal(app.state().balance,80000);
    await app.action("submitResetData");assert.equal((await app.reload()).state().legacyIncome,0);
});

test("existing search/filter/sort, daily reason, monthly totals and event wiring remain functional",async()=>{
    const app=await boot(JSON.stringify(original()));
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
    await app.elements["modal-form"].listeners.submit({preventDefault(){}});
    assert.equal(app.run("activeModal"),"reason");
    assert.equal(app.state().balance,20);
    await app.run("cancelModal()");assert.equal(app.state().expenses[1].reason,"No reason given");
    assert.deepEqual((await app.reload()).state(),app.state());
});

test("income deletion succeeds after expense refund and survives reload",async()=>{
    const app=await boot(JSON.stringify(original()));
    assert.equal(await app.action("submitDeleteExpense",2),true);
    assert.equal(app.state().balance,100);
    assert.equal(await app.action("submitDeleteIncome",1),true);
    assert.equal(app.state().balance,0);
    assert.equal((await app.reload()).state().income.length,0);
});

test("all amount-entry actions reject unsafe or negative values without writes",async()=>{
    const app=await boot(JSON.stringify({...original(),goals:[{id:3,name:"Book",target:100,saved:0}]}));
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
            assert.equal(await app.action(action,id),false,action+" "+amount);
            assert.equal(app.storage.get(KEY),before);
        }
    }
});

test("partial historical income is retained separately and backups never collide",async()=>{
    const raw=JSON.stringify({...original(),balance:180,totalIncome:200});
    const app=await boot(raw);
    assert.equal(app.state().legacyIncome,100);
    assert.equal(app.state().openingBalanceAdjustment,0);
    assert.equal(app.state().income.length,1);
    app.run('backupRaw("first"); backupRaw("second")');
    assert.equal(app.backups().length,3);
    assert.deepEqual(app.backups().map(([,value])=>value),[raw,"first","second"]);
    assert.deepEqual((await app.reload()).state(),app.state());
});

function withdrawalFixture() {
    return boot(JSON.stringify({...original(),balance:30,goals:[
        {id:3,name:"Book",target:30,saved:30},
        {id:4,name:"Laptop",target:100,saved:20}
    ]}));
}

test("withdrawal: small and full amounts persist without changing transactions or other goals",async()=>{
    const app=await withdrawalFixture();const before=app.state();
    app.form({"withdrawal-amount":"1"});
    assert.equal(await app.action("submitWithdrawSavings",3),true);
    assert.equal(app.state().balance,31);assert.equal(app.state().goals[0].saved,29);
    assert.deepEqual(app.state().income,before.income);assert.deepEqual(app.state().expenses,before.expenses);
    assert.deepEqual(app.state().goals[1],before.goals[1]);
    assert.equal(app.state().totalIncome,before.totalIncome);
    assert.deepEqual((await app.reload()).state(),app.state());
    app.form({"withdrawal-amount":"29"});assert.equal(await app.action("submitWithdrawSavings",3),true);
    assert.equal(app.state().balance,60);assert.equal(app.state().goals[0].saved,0);
    assert.deepEqual((await app.reload()).state(),app.state());
    assert.match(app.elements['toast'].textContent,/withdrawn/);
});

test("withdrawal: multiple goals remain independent and accounting stays valid",async()=>{
    const app=await withdrawalFixture();
    for(const [id,amount] of [[3,"10"],[4,"20"],[3,"20"]]){
        app.form({"withdrawal-amount":amount});assert.equal(await app.action("submitWithdrawSavings",id),true);
        assert.doesNotThrow(()=>app.run('validateState(state)'));
    }
    assert.equal(app.state().balance,80);
    assert.deepEqual(app.state().goals.map(goal=>goal.saved),[0,0]);
    assert.deepEqual((await app.reload()).state(),app.state());
});

test("withdrawal: invalid, excessive and empty-goal requests make no changes",async()=>{
    const app=await withdrawalFixture();const before=app.state();const saved=app.storage.get(KEY);
    for(const value of ["0","-1","31","","abc","NaN","Infinity","1.5","9007199254740992","9".repeat(309)]){
        app.form({"withdrawal-amount":value});assert.equal(await app.action("submitWithdrawSavings",3),false,value);
        assert.deepEqual(app.state(),before);assert.equal(app.storage.get(KEY),saved);
        assert.equal(app.elements['modal-error'].hidden,false);
    }
    app.form({"withdrawal-amount":"30"});await app.action("submitWithdrawSavings",3);
    app.form({"withdrawal-amount":"1"});assert.equal(await app.action("submitWithdrawSavings",3),false);
    assert.equal(app.state().goals[0].saved,0);
});

test("withdrawal: missing goals, recovery mode and invalid accounting cannot commit",async()=>{
    const app=await withdrawalFixture();app.form({"withdrawal-amount":"1"});
    const saved=app.storage.get(KEY);assert.equal(await app.action("submitWithdrawSavings",999),false);
    assert.equal(app.storage.get(KEY),saved);
    app.run('state.balance += 1');const before=app.state();
    assert.equal(await app.action("submitWithdrawSavings",3),false);assert.deepEqual(app.state(),before);
    assert.equal(app.storage.get(KEY),saved);
    const corrupt=await boot('{broken');corrupt.form({"withdrawal-amount":"1"});
    assert.equal(await corrupt.action("submitWithdrawSavings",3),false);assert.equal(corrupt.storage.get(KEY),'{broken');
});

test("withdrawal: completed goals expose the action and modal submit uses integrity wrapper",async()=>{
    const app=await withdrawalFixture();assert.match(app.elements['goal-list'].innerHTML,/data-withdraw-savings="3"/);
    app.run('openModal("withdrawSavings",3)');
    assert.match(app.elements['modal-description'].textContent,/Rp 30 available/);
    app.form({"withdrawal-amount":"10"});
    await app.elements['modal-form'].listeners.submit({preventDefault(){}});
    assert.equal(app.state().balance,40);assert.equal(app.state().goals[0].saved,20);
    assert.equal(app.elements['modal-overlay'].hidden,true);
    assert.deepEqual((await app.reload()).state(),app.state());
});

test("withdrawal: safe-integer boundary transfers exactly and overflow is rejected",async()=>{
    const max=Number.MAX_SAFE_INTEGER;
    const app=await boot(JSON.stringify({balance:max-1,totalIncome:max,dailyLimit:0,
        income:[income(1,max)],expenses:[],goals:[{id:2,name:"Boundary",target:1,saved:1}],lastId:2}));
    app.form({"withdrawal-amount":"1"});
    assert.equal(await app.action("submitWithdrawSavings",2),true);
    assert.equal(app.state().balance,max);assert.equal(app.state().goals[0].saved,0);
    assert.deepEqual((await app.reload()).state(),app.state());
    app.run('state.goals[0].saved = 1');
    const before=app.state();const saved=app.storage.get(KEY);
    assert.equal(await app.action("submitWithdrawSavings",2),false);
    assert.deepEqual(app.state(),before);assert.equal(app.storage.get(KEY),saved);
    assert.match(app.elements['modal-error'].textContent,/safe whole-rupiah range/);
});

test("save failure: saveState returns explicit success, failure and blocked results",async()=>{
    const app=await boot(JSON.stringify(original()));assert.equal(await app.run('saveState()'),true);
    const saved=app.storage.get(KEY);const state=app.state();app.options.failWrite=true;
    assert.equal(await app.run('saveState()'),false);
    assert.equal(app.storage.get(KEY),saved);assert.deepEqual(app.state(),state);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    assert.equal(app.elements['retry-save'].hidden,false);
    app.run('actionInProgress=true');assert.equal(await app.run('saveState()'),false);
    const broken=await boot('{broken');assert.equal(await broken.run('saveState()'),false);
    assert.equal(broken.storage.get(KEY),'{broken');
});

test("save failure: valid action remains in memory, old save intact, no false success",async()=>{
    const app=await boot(JSON.stringify(original()));const saved=app.storage.get(KEY);
    app.run('showToast("Previous success")');app.options.failWrite=true;
    app.form({'income-name':'Unsaved income','income-amount':'20','income-category':'Gift'});
    app.run('activeModal="addIncome"');
    await app.elements['modal-form'].listeners.submit({preventDefault(){}});
    assert.equal(app.state().balance,100);assert.equal(app.state().income.length,2);
    assert.equal(app.storage.get(KEY),saved);
    assert.equal(app.elements['toast'].hidden,true);assert.equal(app.elements['toast'].textContent,'');
    assert.equal(app.elements['modal-overlay'].hidden,true);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    assert.equal((await app.reload()).state().balance,80);
});

test("save failure: retry persists once without replaying action and clears notice only on success",async()=>{
    const app=await withdrawalFixture();const saved=app.storage.get(KEY);app.options.failWrite=true;
    app.form({'withdrawal-amount':'10'});assert.equal(await app.action('submitWithdrawSavings',3),true);
    assert.equal(app.state().balance,40);assert.equal(app.state().goals[0].saved,20);
    await app.elements['retry-save'].listeners.click();
    assert.equal(app.storage.get(KEY),saved);assert.equal(app.elements['save-failure-notice'].hidden,false);
    assert.equal(app.elements['toast'].hidden,true);
    app.options.failWrite=false;await app.elements['retry-save'].listeners.click();
    assert.equal(app.state().balance,40);assert.equal(app.state().goals[0].saved,20);
    assert.deepEqual((await app.reload()).state(),app.state());
    assert.equal(app.elements['save-failure-notice'].hidden,true);
    assert.equal(app.elements['retry-save'].hidden,true);
    assert.equal(app.elements['toast'].textContent,'Your changes have been saved.');
});

test("save failure: a later successful action saves all retained changes",async()=>{
    const app=await withdrawalFixture();app.options.failWrite=true;
    app.form({'withdrawal-amount':'5'});await app.action('submitWithdrawSavings',3);
    app.options.failWrite=false;app.form({'withdrawal-amount':'5'});await app.action('submitWithdrawSavings',4);
    assert.equal(app.state().balance,40);
    assert.deepEqual((await app.reload()).state(),app.state());
    assert.equal(app.elements['save-failure-notice'].hidden,true);
    assert.match(app.elements['toast'].textContent,/withdrawn/);
});

test("save failure: failed migration commit preserves source and backup, never defaults",async()=>{
    const raw=JSON.stringify(original());
    const app=await boot(raw,{failMainWrite:true});
    assert.equal(app.storage.get(KEY),raw);assert.equal(app.backups()[0][1],raw);
    assert.equal(app.state().balance,80);assert.equal(app.state().income.length,1);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    app.options.failMainWrite=false;await app.run('retrySave()');
    assert.equal(JSON.parse(app.storage.get(KEY)).schemaVersion,1);
    assert.deepEqual((await app.reload()).state(),app.state());
});

test("save failure: invalid actions still roll back while unsaved state is retained",async()=>{
    const app=await withdrawalFixture();app.options.failWrite=true;
    app.form({'withdrawal-amount':'1'});await app.action('submitWithdrawSavings',3);
    const before=app.state();const saved=app.storage.get(KEY);
    app.form({'income-name':'Bad','income-category':'Invalid','income-amount':'5'});
    assert.equal(await app.action('submitAddIncome'),false);assert.deepEqual(app.state(),before);
    assert.equal(app.storage.get(KEY),saved);assert.equal(app.elements['save-failure-notice'].hidden,false);
    app.run('state.balance++');await assert.rejects(()=>app.run('saveState()'),/accounting/);
    assert.equal(app.storage.get(KEY),saved);
});

test("save failure: reset is not falsely reported saved and original persisted state remains",async()=>{
    const app=await boot(JSON.stringify(original()));const saved=app.storage.get(KEY);app.options.failWrite=true;
    assert.equal(await app.action('submitResetData'),true);
    assert.equal(app.state().balance,0);assert.equal(app.storage.get(KEY),saved);
    assert.equal(app.elements['toast'].hidden,true);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
    app.options.failWrite=false;await app.run('retrySave()');assert.equal((await app.reload()).state().balance,0);
});

async function syncPair() {
    const a=await boot(JSON.stringify(original()));
    const b=await boot(null,{storage:a.storage});
    return {a,b};
}
function enterIncome(app,name='New',amount='20') {
    app.form({'income-name':name,'income-amount':amount,'income-category':'Gift'});
}

test('sync: clean storage event adopts latest state without writing or duplicating records',async()=>{
    const {a,b}=await syncPair();enterIncome(a);
    await a.action('submitAddIncome');const raw=a.storage.get(KEY);
    b.external();assert.deepEqual(b.state(),a.state());assert.equal(b.storage.get(KEY),raw);
    assert.equal(b.run('syncConflict'),false);assert.equal(b.state().income.length,2);
    b.external();assert.equal(b.state().income.length,2);
    assert.match(b.elements.balance.textContent,/100/);
});

test('sync: stale writes reject even before a storage event arrives',async()=>{
    const {a,b}=await syncPair();enterIncome(a,'A');await a.action('submitAddIncome');
    const raw=a.storage.get(KEY);enterIncome(b,'B','10');await b.action('submitAddIncome');
    assert.equal(await b.run('saveState()'),false);
    assert.equal(b.storage.get(KEY),raw);assert.equal(b.run('syncConflict'),true);
    assert.equal(b.state().income.at(-1).name,'B');assert.equal(b.state().balance,90);
    assert.equal(b.elements.toast.hidden,true);assert.equal(b.elements['sync-conflict-notice'].hidden,false);
});

test('sync: open form retains draft and blocks submission until explicit discard',async()=>{
    const {a,b}=await syncPair();b.run('openModal("addIncome")');enterIncome(b,'Draft','50');
    enterIncome(a,'A');await a.action('submitAddIncome');const raw=a.storage.get(KEY);
    b.external();assert.equal(b.elements['income-name'].value,'Draft');
    assert.equal(b.run('activeModal'),'addIncome');assert.equal(b.run('syncConflict'),true);
    assert.equal(await b.action('submitAddIncome'),false);assert.equal(b.storage.get(KEY),raw);
    b.run('discardLocalChanges()');assert.deepEqual(b.state(),a.state());
    assert.equal(b.run('activeModal'),null);assert.equal(b.run('syncConflict'),false);
    assert.equal(b.storage.get(KEY),raw);
});

test('sync: failed-save state survives external update and retry cannot overwrite it',async()=>{
    const {a,b}=await syncPair();b.options.failWrite=true;enterIncome(b,'Unsaved','10');
    await b.action('submitAddIncome');const local=b.state();
    enterIncome(a,'External','20');await a.action('submitAddIncome');const raw=a.storage.get(KEY);
    b.external();assert.deepEqual(b.state(),local);assert.equal(b.run('syncConflict'),true);
    b.options.failWrite=false;await b.run('retrySave()');assert.equal(b.storage.get(KEY),raw);
    assert.equal(b.elements.toast.hidden,true);
    b.run('discardLocalChanges()');assert.deepEqual(b.state(),a.state());
    assert.equal(b.elements['save-failure-notice'].hidden,true);
});

test('sync: concurrent writers are serialized and only one stale-base transaction commits',async()=>{
    const {a,b}=await syncPair();const before=JSON.parse(a.storage.get(KEY)).revision;
    enterIncome(a,'A');enterIncome(b,'B');
    await Promise.all([a.action('submitAddIncome'),b.action('submitAddIncome')]);
    const saved=JSON.parse(a.storage.get(KEY));assert.equal(saved.income.length,2);
    assert.equal(saved.revision,before+1);
    assert.equal(Number(a.run('syncConflict'))+Number(b.run('syncConflict')),1);
    const loser=a.run('syncConflict')?a:b;
    assert.equal(loser.state().income.length,2);assert.equal(await loser.run('saveState()'),false);
});

test('sync: revisions survive reload, advance on reset and never wrap',async()=>{
    const {a,b}=await syncPair();const first=a.run('revision');
    const reloaded=await a.reload();assert.equal(reloaded.run('revision'),first);
    assert.equal(JSON.parse(a.storage.get(KEY)).revision,first);
    await a.action('submitResetData');assert.equal(a.run('revision'),first+1);
    b.external();assert.equal(b.state().balance,0);assert.equal(b.run('revision'),first+1);
    const limit=JSON.parse(a.storage.get(KEY));limit.revision=Number.MAX_SAFE_INTEGER;
    const capped=await boot(JSON.stringify(limit));const raw=capped.storage.get(KEY);
    assert.equal(await capped.run('saveState()'),false);assert.equal(capped.storage.get(KEY),raw);
});

test('sync: corrupt external data preserves local state and recovery backup',async()=>{
    const {a,b}=await syncPair();const local=b.state();a.storage.set(KEY,'{broken');
    b.external();assert.deepEqual(b.state(),local);assert.equal(b.run('recoveryRequired'),true);
    assert.equal(await b.run('saveState()'),false);assert.equal(b.storage.get(KEY),'{broken');
    assert(b.backups().some(([,raw])=>raw==='{broken'));
});

test('sync: discard refuses corrupt incoming data and preserves unsaved work',async()=>{
    const {a,b}=await syncPair();enterIncome(b,'Unsaved');b.options.failWrite=true;
    await b.action('submitAddIncome');b.options.failWrite=false;const local=b.state();
    a.storage.set(KEY,'{broken');b.external();b.run('discardLocalChanges()');
    assert.deepEqual(b.state(),local);assert.equal(b.run('recoveryRequired'),true);
    assert.equal(b.storage.get(KEY),'{broken');assert.equal(b.run('syncConflict'),true);
});

test('sync: withdrawal reaches clean peer without fake income or duplicate transfers',async()=>{
    const a=await withdrawalFixture();const b=await boot(null,{storage:a.storage});
    a.form({'withdrawal-amount':'10'});await a.action('submitWithdrawSavings',3);
    b.external();assert.deepEqual(b.state(),a.state());assert.equal(b.state().balance,40);
    assert.equal(b.state().goals[0].saved,20);assert.equal(b.state().income.length,1);
    b.external();assert.equal(b.state().balance,40);
});

test('sync: unrelated keys ignored, delayed events read newest state, removal does not resurrect data',async()=>{
    const {a,b}=await syncPair();enterIncome(a);await a.action('submitAddIncome');
    b.external('other-key');assert.equal(b.state().balance,80);
    enterIncome(a,'Next','30');await a.action('submitAddIncome');b.external();
    assert.equal(b.state().balance,130);
    a.storage.delete(KEY);b.external(null);assert.equal(b.state().balance,0);
    assert.equal(a.storage.has(KEY),false);assert.equal(b.run('syncConflict'),false);
});

test('sync: no Web Locks fails closed instead of writing unsafely',async()=>{
    const raw=JSON.stringify(original());const app=await boot(raw,{noLocks:true});
    assert.equal(await app.run('saveState()'),false);assert.equal(app.storage.get(KEY),raw);
    assert.equal(app.elements['save-failure-notice'].hidden,false);
});

test('sync: raw comparison rejects changed data even if external writer reused revision',async()=>{
    const {a,b}=await syncPair();const changed=JSON.parse(a.storage.get(KEY));
    changed.income.push(income(20,10));changed.balance+=10;changed.totalIncome+=10;
    const raw=JSON.stringify(changed);a.storage.set(KEY,raw);
    assert.equal(await b.run('saveState()'),false);assert.equal(b.storage.get(KEY),raw);
    assert.equal(b.run('syncConflict'),true);
});

test('sync: older revision requires explicit resolution and next revision remains monotonic',async()=>{
    const {a,b}=await syncPair();const old=a.storage.get(KEY);
    enterIncome(a);await a.action('submitAddIncome');b.external();const high=b.run('revision');
    a.storage.set(KEY,old);b.external();assert.equal(b.run('syncConflict'),true);
    assert.equal(b.state().balance,100);
    b.run('discardLocalChanges()');assert.equal(b.state().balance,80);
    assert.equal(b.run('revision'),high);enterIncome(b);await b.action('submitAddIncome');
    assert.equal(JSON.parse(b.storage.get(KEY)).revision,high+1);
});

test('sync: opening another modal cannot erase a conflicted draft',async()=>{
    const {a,b}=await syncPair();b.run('openModal("addIncome")');enterIncome(b,'Keep this');
    enterIncome(a);await a.action('submitAddIncome');b.external();
    b.run('openModal("addExpense")');assert.equal(b.run('activeModal'),'addIncome');
    assert.equal(b.elements['income-name'].value,'Keep this');
});

test('sync: repaired duplicate IDs persist even with a higher valid stored counter',async()=>{
    const {a}=await syncPair();const saved=JSON.parse(a.storage.get(KEY));
    saved.income=[income(1,50),income(1,50)];saved.lastId=99;
    const app=await boot(JSON.stringify(saved));const repaired=JSON.parse(app.storage.get(KEY));
    assert.equal(new Set([...repaired.income,...repaired.expenses].map(item=>item.id)).size,3);
    assert.equal(repaired.revision,saved.revision+1);assert.equal(repaired.lastId,99);
});

test('P2: modal focus uses connected trigger or replacement for edited records and withdrawal',async()=>{
    const app=await boot();
    for(const [name,attribute] of [['editIncome','data-edit-income'],['editExpense','data-edit-expense'],['withdrawSavings','data-withdraw-savings']]) {
        app.run(`lastFocused={isConnected:true,getClientRects:()=>[1],focus(){document.activeElement='original'}};
            document.querySelector=()=>({isConnected:true,getClientRects:()=>[1],focus(){document.activeElement='replacement'}});
            restoreModalFocus('${name}',1);`);
        assert.equal(app.run('document.activeElement'),'original');
        app.run(`lastFocused.isConnected=false; restoreModalFocus('${name}',1);`);
        assert.equal(app.run('document.activeElement'),'replacement');
        app.run(`document.querySelector=selector=>selector==='[${attribute}="1"]'
            ? {isConnected:true,getClientRects:()=>[1],focus(){document.activeElement='matching record'}} : null;
            restoreModalFocus('${name}',1);`);
        assert.equal(app.run('document.activeElement'),'matching record');
    }
});

test('P2: deletion restores focus within list or to its search when empty/filtered',async()=>{
    const app=await boot();
    for(const [name,attribute,id] of [['deleteIncome','data-delete-income','income-search'],['deleteExpense','data-delete-expense','expense-search']]){
        app.run(`lastFocused={isConnected:false,focus(){throw Error('detached focus')}};
            document.querySelector=selector=>selector==='[${attribute}]'
                ? {isConnected:true,getClientRects:()=>[1],focus(){document.activeElement='next row'}} : null;
            restoreModalFocus('${name}',1);`);
        assert.equal(app.run('document.activeElement'),'next row');
        app.elements[id].isConnected=true;app.elements[id].getClientRects=()=>[1];
        app.elements[id].focus=()=>app.run('document.activeElement="search"');
        app.run(`document.querySelector=()=>null;restoreModalFocus('${name}',1);`);
        assert.equal(app.run('document.activeElement'),'search');
    }
});

test('P2: monthly count label matches expense count without changing monetary totals',async()=>{
    const app=await boot();
    app.run(`state.income=[{id:1,name:'Income',amount:100,category:'Gift',date:todayISODate()}];
        state.expenses=[{id:2,name:'Expense',amount:20,category:'Food',date:todayISODate()}];renderSummary();`);
    assert.match(html,/<dt>Expense transactions<\/dt>\s*<dd id="summary-transactions">/);
    assert.equal(app.elements['summary-transactions'].textContent,1);
    assert.equal(app.elements['summary-income'].textContent,'Rp 100');
    assert.equal(app.elements['summary-expenses'].textContent,'Rp 20');
    assert.equal(app.elements['summary-remaining'].textContent,'Rp 80');
});
