/*
 * Copyright 2014 University of California, Berkeley.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Author: Liang Gong

J$.analysis = {};

((function (sandbox){
    // simulate stack trace in normal execution
    var stack = [];
    function getLocation(iid) {
        if(window.getLocationFromIID){
            return window.getLocationFromIID(iid);
        } else {
            return '[iid]: ' + iid;
        }
    }

    ///////////////////////////////////////////////////
    var analysisDB = {};

    function isArr(arr) {
        if( Object.prototype.toString.call(arr) === '[object Array]' ) {
            return true
        }
        return false;
    }

    var HAS_OWN_PROPERTY = Object.prototype.hasOwnProperty;
    var HAS_OWN_PROPERTY_CALL = Object.prototype.hasOwnProperty.call;
    var ISNAN = isNaN;
    var PARSEINT = parseInt;

    function HOP(obj, prop) {
        return HAS_OWN_PROPERTY_CALL.apply(HAS_OWN_PROPERTY, [obj, prop]);
    }

    function getAnalysisDB() {
        return analysisDB;
    }

    function setAnalysisDB(db) {
        analysisDB = db;
    }

    function getCount(checkName, index) {
        index = index + '';
        if (!HOP(analysisDB, checkName)) {
            return undefined;
        }

        if (!HOP(analysisDB[checkName], index)) {
            return undefined;
        } else {
            if (!HOP(analysisDB[checkName][index], 'count')) {
                return undefined;
            } else {
                return analysisDB[checkName][index].count;
            }
        }
    }

    function addCount(checkName, index) {
        index = index + '';
        if (!HOP(analysisDB, checkName)) {
            analysisDB[checkName] = {};
        }

        if (!HOP(analysisDB[checkName], index)) {
            analysisDB[checkName][index] = {count: 1};
        } else {
            if (!HOP(analysisDB[checkName][index], 'count')) {
                analysisDB[checkName][index].count = 1;
            } else {
                analysisDB[checkName][index].count++;
            }
        }
    }

    function getByIndexArr (indexArr) {
        var curDB = analysisDB;
        for (var i=0; i<indexArr.length; i++) {
            if (!HOP(curDB, indexArr[i] + "")) {
                return undefined;
            }
            curDB = curDB[indexArr[i] + ""];
        }
        return curDB;
    }

    function setByIndexArr (indexArr, data) {
        var curDB = analysisDB;
        for (var i=0; i<indexArr.length - 1; i++) {
            if (!HOP(curDB, indexArr[i] + "")) {
                curDB[indexArr[i] + ""] = {};
            }
            curDB = curDB[indexArr[i] + ""];
        }

        curDB[indexArr[indexArr.length - 1] + ""] = data;
    }

    function AddCountByIndexArr (indexArr) {
        var metaData = getByIndexArr(indexArr);
        if(typeof metaData === 'undefined'){
            setByIndexArr(indexArr, {'count': 1});
        } else{
            metaData.count++;
        }
    }

    function getCountByIndexArr (indexArr) {
        var metaData = getByIndexArr(indexArr);
        if(typeof metaData === 'undefined'){
            return undefined;
        } else{
            return metaData.count;
        }
    }

    /////////////////////////////////////////

    function generateObjSig(obj) {
        var sig = {};
        var obj_layout  = '';
        try{
            if(typeof obj!=='string' && typeof obj!=='number' && typeof obj!=='boolean'){
                for (var prop in obj) {
                    if (obj.hasOwnProperty(prop)) {
                        if(ISNAN(parseInt(prop))){ // if prop is number e.g., '0', '1' etc. then do not add it into the prop
                            obj_layout += prop + '|';
                        }
                    }
                }
            }
           
            sig = {'obj_layout': obj_layout, 'pto': 'empty', 'con': 'empty'};
            sig.pto = obj.__proto__;
            sig.con = obj.constructor;
        }catch(e) {
            sig = 'exception when generating signature';
        }
        return sig;
    }

    function isEqualObjSig (sig1, sig2) {
        if(sig1.obj_layout === sig2.obj_layout && sig1.pto === sig2.pto && sig1.con === sig2.con) {
            return true;
        } else {
            return false;
        }
    }

    function objSigToString (sig) {
        var str = '';
        try {
            str = JSON.stringify(sig);
            if(sig.con && sig.con.name){
                str = str + " | constructor: " + sig.con.name;
            }

            if(sig.pto && sig.pto.constructor){
                str = str + " | proto constructor: " + sig.pto.constructor.name;
            }
        }catch(e) {
            str = sig.obj_layout + ' | constructor or prototype cannot be stringified';
        }
        return str;
    }

    function isNormalNumber(num) {
        if (typeof num === 'number' && !ISNAN(num)) {
            return true;
        }
        return false;
    }

    var warning_limit = 10;

    function setWarningLimit(newlimit){
        warning_limit = newlimit;
    }

    function printResult () {
        try{
        var num = 0;
        console.log("----------------------------");
        console.log('Report of polymorphic statements:');

        // first sort the results
        var jitArr = [];
        var jitResult = getByIndexArr(['JIT-checker', 'polystmt']);
        for (var prop in jitResult) {
            if (HOP(jitResult, prop)) {
                var query_sig = jitResult[prop];
                if(query_sig && query_sig.length > 1){
                    jitArr.push({'sigList': query_sig, 'iid': PARSEINT(prop)});
                    num++;
                }
            }
        }

        // extract the second most frequently used signature count
        jitArr.sort(function compare(a, b) {
            var mostFreq = 0;
            var secMostFreq = 0;
            var curCnt = 0;
            for(var i=0;i<a.sigList.length;i++){
                curCnt = a.sigList[i].count;
                if(mostFreq < curCnt) {
                    secMostFreq = mostFreq;
                    mostFreq = curCnt;
                } else if (secMostFreq < curCnt) {
                    secMostFreq = curCnt;
                }
            }

            while(mostFreq >= 1){
                mostFreq /= 10.0;
            }

            var weightA = secMostFreq + mostFreq;

            mostFreq = 0;
            secMostFreq = 0;
            for(var i=0;i<b.sigList.length;i++){
                curCnt = b.sigList[i].count;
                if(mostFreq < curCnt) {
                    secMostFreq = mostFreq;
                    mostFreq = curCnt;
                } else if (secMostFreq < curCnt) {
                    secMostFreq = curCnt;
                }
            }

            while(mostFreq >= 1){
                mostFreq /= 10.0;
            }

            var weightB = secMostFreq + mostFreq;

            // sort in descending order
            return weightB - weightA;
        });

        for(var i=0;i<jitArr.length && i<warning_limit ;i++) {
            var query_sig = jitArr[i].sigList;
            if(query_sig && query_sig.length > 1){
                console.log('------');
                console.log('[Location: ' + getLocation(jitArr[i].iid) + '] <- No. layouts: ' + query_sig.length);
                for(var j=0;j<query_sig.length;j++) {
                    console.log('count: ' + query_sig[j].count + ' -> layout['+jitArr[i].iid+']:' + objSigToString(query_sig[j].sig));
                }
            }
        }
        console.log('...');
        console.log('Number of polymorphic statements spotted: ' + num);
        console.log("---------------------------");

        console.log('Report of loading undeclared or deleted array elements:')
        var uninitArrDB = getByIndexArr(['JIT-checker', 'uninit-array-elem']);
        num = 0;
        var jitUninitArr = [];
        for(var prop in uninitArrDB) {
            if (HOP(uninitArrDB, prop)) {
                jitUninitArr.push({'iid': prop, 'count': uninitArrDB[prop].count});
                num++;
            }
        }
        jitUninitArr.sort(function compare(a, b) {
            return b.count - a.count;
        });
        for(var i=0;i<jitUninitArr.length && i< warning_limit;i++){
            console.log('Location: ' + getLocation(jitUninitArr[i].iid) + '] <- No. usages: ' + jitUninitArr[i].count);
        }
        console.log('...');
        console.log('Number of loading undeclared or deleted array elements spotted: ' + num);
       

        console.log("---------------------------");
        console.log('Report of switching array type');
        var switchArrTypeArr = [];
        var switchArrTypeDB = getByIndexArr(['JIT-checker', 'arr-type-switch']);
        num = 0;
        for(var prop in switchArrTypeDB) {
            if (HOP(switchArrTypeDB, prop)) {
                switchArrTypeArr.push({'iid': prop, 'count': switchArrTypeDB[prop].count});
                num++;
            }
        }
        switchArrTypeArr.sort(function compare(a, b) {
            return b.count - a.count;
        });
        for(var i=0;i<switchArrTypeArr.length && i< warning_limit;i++){
            console.log('[Location: ' + getLocation(switchArrTypeArr[i].iid) + '] <- No. usages: ' + switchArrTypeArr[i].count);
        }
        console.log('...');
        console.log('Number of switching array type spotted: ' + num);
        console.log("---------------------------");

        console.log('Report of making incontiguous array:')
        var incontArrDBArr = [];
        var incontArrDB = getByIndexArr(['JIT-checker', 'incont-array']);
        num = 0;
        for(var prop in incontArrDB) {
            if (HOP(incontArrDB, prop)) {
                incontArrDBArr.push({'iid': prop, 'count': incontArrDB[prop].count});
                num++;
            }
        }
        incontArrDBArr.sort(function compare(a, b) {
            return b.count - a.count;
        });
        for(var i=0;i<incontArrDBArr.length && i< warning_limit;i++){
            console.log('[Location: ' + getLocation(incontArrDBArr[i].iid) + '] <- No. usages: ' + incontArrDBArr[i].count);
        }
        console.log('...');
        console.log('Number of putting incontiguous array statements: ' + num);
        console.log('Why: In order to handle large and sparse arrays, there are two types of array storage internally:\n' +
                '\t * Fast Elements: linear storage for compact key sets\n' +
                '\t * Dictionary Elements: hash table storage otherwise\n' +
                'It\'s best not to cause the array storage to flip from one type to another.');
        console.log("---------------------------");

        console.log('Report of initialize object field in non-constructor:');
        var initObjNonConstrArr = [];
        var initObjNonConstrDB = getByIndexArr(['JIT-checker', 'init-obj-nonconstr']);
        num = 0;
        for(var prop in initObjNonConstrDB) {
            if (HOP(initObjNonConstrDB, prop)) {
                initObjNonConstrArr.push({'iid': prop, 'count': initObjNonConstrDB[prop].count});
                num++;
            }
        }
        initObjNonConstrArr.sort(function compare(a, b) {
            return b.count - a.count;
        });
        for(var i=0;i<initObjNonConstrArr.length && i< warning_limit;i++){
            console.log('[Location: ' + getLocation(initObjNonConstrArr[i].iid) + '] <- No. usages: ' + initObjNonConstrArr[i].count);
        }
        console.log('Number of statements init objects in non-constructor: ' + num);
        console.log("---------------------------");
        }catch(e) {
            console.log("error!!");
            console.log(e);
        }
    }

   
   
    function getField (iid, base, offset, val) {
        if(base){
            if(isArr(base)){
                // check using uninitialized
                if(isNormalNumber(offset) && !HOP(base, offset+'')) {
                    AddCountByIndexArr(['JIT-checker', 'uninit-array-elem', iid]);
                }
                return val;
            }

            var sig = generateObjSig(base);
            var query_sig = getByIndexArr(['JIT-checker', 'polystmt', iid]);
            if(typeof query_sig === 'undefined') {
                setByIndexArr(['JIT-checker', 'polystmt', iid], [{'count': 1, 'sig': sig}]);
            } else if (isArr(query_sig)) {
                outter: {
                    for(var i=0;i<query_sig.length;i++){
                        if(isEqualObjSig(query_sig[i].sig, sig)) {
                            query_sig[i].count++;
                            break outter;
                        }
                    }
                    query_sig.push({'count': 1, 'sig': sig});
                }
            }
        }
       
        return val;
    }

    function putFieldPre (iid, base, offset, val) {
        if(isArr(base) && isNormalNumber(offset)) {
            // attach a meta data 'numeric' or 'non-numeric' to this array
            // if the meta data does not exist, check the type of this array
            if(typeof base['*J$*'] === 'undefined') {
                base['*J$*'] = {'arrType': 'unknown'};
                inner:
                for(var i=0;i<base.length;i++){
                    if(typeof base[i] !== 'number' && typeof base[i] !== 'undefined') {
                        base['*J$*'].arrType = 'non-numeric';
                        break inner;
                    }
                    base['*J$*'].arrType = 'numeric';
                }
            }

            // for now this code does not check switching from non-numeric array to numeric, as it might be expensive
            if(base['*J$*'].arrType === 'numeric') {
                if(typeof val !== 'number' && typeof val !== 'undefined') {
                    AddCountByIndexArr(['JIT-checker', 'arr-type-switch', iid]);
                    base['*J$*'].arrType = 'non-numeric';
                }
            }

            if(base.length < offset) {
                AddCountByIndexArr(['JIT-checker', 'incont-array', iid]);
            }
        } else if(typeof base[offset] === 'undefined' && typeof val !== 'undefined') { // check init object members in non-consturctor functions
            if(stack.length > 0 && stack[stack.length - 1].isCon === false) {
                //console.log('[checker]: initialize obj in non-consturctor detected');
                AddCountByIndexArr(['JIT-checker', 'init-obj-nonconstr', iid]);
            } else if (stack.length===0){
                //console.log('[checker]: initialize obj in non-consturctor detected');
                AddCountByIndexArr(['JIT-checker', 'init-obj-nonconstr', iid]);
            } else if (stack.length > 0 && !(base instanceof stack[stack.length - 1].fun)) {
                //console.log('[checker]: initialize obj in non-consturctor detected');
                AddCountByIndexArr(['JIT-checker', 'init-obj-nonconstr', iid]);
            }
        }
        return val;
    }

    function invokeFunPre (iid, f, base, args, isConstructor) {
        stack.push({"fun": f, "isCon": isConstructor});
    }

    function invokeFun (iid, f, base, args, val, isConstructor) {

        if(isConstructor){ // check the return value of the constructor
            var sig = generateObjSig(val);
            var query_sig = getByIndexArr(['JIT-checker', 'polystmt', iid]);
            if(typeof query_sig === 'undefined') {
                setByIndexArr(['JIT-checker', 'polystmt', iid], [{'count': 1, 'sig': sig}]);
            } else if (isArr(query_sig)) {
                outter: {
                    for(var i=0;i<query_sig.length;i++){
                        if(isEqualObjSig(query_sig[i].sig, sig)) {
                            query_sig[i].count++;
                            break outter;
                        }
                    }
                    query_sig.push({'count': 1, 'sig': sig});
                }
            }
        }

        stack.pop();
        return val;
    }
	
	function endExecution() {
		printResult();
	}

    sandbox.getField = getField;
    sandbox.putFieldPre = putFieldPre;
    sandbox.invokeFunPre = invokeFunPre;
    sandbox.invokeFun = invokeFun;
    sandbox.endExecution = endExecution;
    sandbox.getAnalysisDB = getAnalysisDB;
    sandbox.setAnalysisDB = setAnalysisDB;
    sandbox.setWarningLimit = setWarningLimit;
})(J$.analysis));