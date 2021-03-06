global = this;
(function (modules) {

    // Bundle allows the run-time to extract already-loaded modules from the
    // boot bundle.
    var bundle = {};
    var main;

    // Unpack module tuples into module objects.
    for (var i = 0; i < modules.length; i++) {
        var module = modules[i];
        module = modules[i] = new Module(
            module[0],
            module[1],
            module[2],
            module[3],
            module[4]
        );
        bundle[module.filename] = module;
    }

    function Module(id, dirname, basename, dependencies, factory) {
        this.id = id;
        this.dirname = dirname;
        this.filename = dirname + "/" + basename;
        // Dependency map and factory are used to instantiate bundled modules.
        this.dependencies = dependencies;
        this.factory = factory;
    }

    Module.prototype._require = function () {
        var module = this;
        if (module.exports === void 0) {
            module.exports = {};
            var require = function (id) {
                var index = module.dependencies[id];
                var dependency = modules[index];
                if (!dependency)
                    throw new Error("Bundle is missing a dependency: " + id);
                return dependency._require();
            };
            require.main = main;
            module.exports = module.factory(
                require,
                module.exports,
                module,
                module.filename,
                module.dirname
            ) || module.exports;
        }
        return module.exports;
    };

    // Communicate the bundle to all bundled modules
    Module.prototype.modules = bundle;

    return function require(filename) {
        main = bundle[filename];
        main._require();
    }
})([["document.js","inkblot","document.js",{},function (require, exports, module, __filename, __dirname){

// inkblot/document.js
// -------------------

'use strict';

module.exports = Document;

function Document(element) {
    var self = this;
    this.element = element;
    this.engine = null;
    this.carry = '';
    this.cursor = null;
    this.next = null;
    this.options = null;
    this.p = false;
    this.br = false;
    this.onclick = onclick;
    function onclick(event) {
        self.answer(event.target.number);
    }
    Object.seal(this);
}

Document.prototype.write = function write(lift, text, drop) {
    var document = this.element.ownerDocument;
    if (this.p) {
        this.cursor = document.createElement("p");
        this.element.insertBefore(this.cursor, this.options);
        this.p = false;
        this.br = false;
    }
    if (this.br) {
        this.cursor.appendChild(document.createElement("br"));
        this.br = false;
    }
    this.cursor.appendChild(document.createTextNode((this.carry || lift) + text));
    this.carry = drop;
};

Document.prototype.break = function _break() {
    this.br = true;
};

Document.prototype.paragraph = function paragraph() {
    this.p = true;
};

Document.prototype.option = function option(number, label) {
    var document = this.element.ownerDocument;
    var tr = document.createElement("tr");
    this.options.appendChild(tr);
    var th = document.createElement("th");
    tr.appendChild(th);
    th.innerText = number + '.';
    var td = document.createElement("td");
    td.innerText = label;
    td.number = number;
    td.onclick = this.onclick;
    tr.appendChild(td);
};

Document.prototype.flush = function flush() {
    // No-op (for console only)
};

Document.prototype.pardon = function pardon() {
    this.clear();
    // No-op (for console only)
};

Document.prototype.display = function display() {
    // No-op (for console only)
};

Document.prototype.clear = function clear() {
    var document = this.element.ownerDocument;
    this.element.innerHTML = "";
    this.options = document.createElement("table");
    this.element.appendChild(this.options);
    this.cursor = null;
    this.br = false;
    this.p = true;
    this.carry = '';
};

Document.prototype.question = function question() {
};

Document.prototype.answer = function answer(text) {
    this.engine.answer(text);
};

Document.prototype.close = function close() {
};

}],["engine.js","inkblot","engine.js",{"./story":6,"./evaluate":2},function (require, exports, module, __filename, __dirname){

// inkblot/engine.js
// -----------------

'use strict';

var Story = require('./story');
var evaluate = require('./evaluate');

module.exports = Engine;

var debug = typeof process === 'object' && process.env.DEBUG_ENGINE;

function Engine(story, start, render, interlocutor, randomer) {
    // istanbul ignore next
    start = start || 'start';
    var self = this;
    this.story = story;
    this.options = [];
    this.keywords = {};
    this.variables = {};
    this.global = new Global(randomer);
    this.top = this.global;
    this.stack = [this.top];
    this.label = '';
    this.instruction = new Story.constructors.goto(start);
    this.render = render;
    this.interlocutor = interlocutor;
    this.interlocutor.engine = this;
    this.randomer = randomer;
    this.debug = debug;
    Object.seal(this);
}

Engine.prototype.continue = function _continue() {
    var _continue;
    do {
        // istanbul ignore if
        if (this.debug) {
            console.log(this.top.at() + '/' + this.label + ' ' + this.instruction.type + ' ' + this.instruction.describe());
        }
        // istanbul ignore if
        if (!this['$' + this.instruction.type]) {
            throw new Error('Unexpected instruction type: ' + this.instruction.type);
        }
        _continue = this['$' + this.instruction.type](this.instruction);
    } while (_continue);
};

Engine.prototype.print = function print(text) {
    this.render.write(this.instruction.lift, text, this.instruction.drop);
    return this.goto(this.instruction.next);
};

Engine.prototype.$text = function text() {
    return this.print(this.instruction.text);
};

Engine.prototype.$print = function print() {
    return this.print('' + evaluate(this.top, this.instruction.expression));
};

Engine.prototype.$break = function $break() {
    this.render.break();
    return this.goto(this.instruction.next);
};

Engine.prototype.$paragraph = function $paragraph() {
    this.render.paragraph();
    return this.goto(this.instruction.next);
};

Engine.prototype.$startJoin = function $startJoin() {
    this.render.startJoin(
        this.instruction.lift,
        this.instruction.delimiter,
        this.instruction.text
    );
    return this.goto(this.instruction.next);
};

Engine.prototype.$delimit = function $delimit() {
    this.render.delimit(this.instruction.delimiter);
    return this.goto(this.instruction.next);
};

Engine.prototype.$stopJoin = function $stopJoin() {
    // TODO thread for "if no delimits"
    this.render.stopJoin();
    return this.goto(this.instruction.next);
};

Engine.prototype.$goto = function $goto() {
    return this.goto(this.instruction.next);
};

Engine.prototype.$call = function $call() {
    var routine = this.story[this.instruction.label];
    // istanbul ignore if
    if (!routine) {
        throw new Error('no such routine ' + this.instruction.label);
    }
    // TODO replace this.global with closure scope if scoped procedures become
    // viable. This will require that the engine create references to closures
    // when entering a new scope (calling a procedure), in addition to
    // capturing locals. As such the parser will need to retain a reference to
    // the enclosing procedure and note all of the child procedures as they are
    // encountered.
    this.top = new Frame(this.global, routine.locals || [], this.instruction.next, this.instruction.branch);
    this.stack.push(this.top);
    return this.goto(this.instruction.branch);
};

Engine.prototype.$subroutine = function $subroutine() {
    // Subroutines exist as targets for labels as well as for reference to
    // locals in calls.
    return this.goto(this.instruction.next);
};

Engine.prototype.$option = function option() {
    this.options.push(this.instruction);
    // for (var i = 0; i < this.instruction.keywords.length; i++) {
    //     var keyword = this.instruction.keywords[i];
    //     this.keywords[keyword] = this.instruction.branch;
    // }
    return this.goto(this.instruction.next);
};

Engine.prototype.$set = function set() {
    var value = evaluate(this.top, this.instruction.expression);
    // istanbul ignore if
    if (this.debug) {
        console.log(this.top.at() + '/' + this.label + ' ' + this.instruction.variable + ' = ' + value);
    }
    this.top.set(this.instruction.variable, value);
    return this.goto(this.instruction.next);
};

Engine.prototype.$jump = function jump() {
    var j = this.instruction;
    if (evaluate(this.top, j.condition)) {
        return this.goto(this.instruction.branch);
    } else {
        return this.goto(this.instruction.next);
    }
};

Engine.prototype.$switch = function _switch() {
    var branches = this.instruction.branches;
    var value;
    if (this.instruction.mode === 'rand') {
        value = Math.floor(this.randomer.random() * branches.length);
    } else {
        value = evaluate(this.top, this.instruction.expression);
        this.top.set(this.instruction.variable, value + this.instruction.value);
    }
    if (this.instruction.mode === 'loop') {
        value = value % branches.length;
    } else if (this.instruction.mode === 'hash') {
        value = evaluate.hash(value) % branches.length;
    }
    value = Math.min(value, branches.length - 1);
    value = Math.max(value, 0);
    var next = branches[value];
    // istanbul ignore if
    if (this.debug) {
        console.log(this.top.at() + '/' + this.label + ' ' + value + ' -> ' + next);
    }
    return this.goto(next);
};

Engine.prototype.$prompt = function prompt() {
    this.prompt();
    return false;
};

Engine.prototype.goto = function _goto(name) {
    while (name === null && this.stack.length > 1 && this.options.length === 0) {
        var top = this.stack.pop();
        this.top = this.stack[this.stack.length - 1];
        name = top.next;
    }
    if (name == null) {
        this.display();
        this.render.break();
        this.interlocutor.close();
        return false;
    }
    var next = this.story[name];
    // istanbul ignore if
    if (!next) {
        throw new Error('Story missing knot for name: ' + name);
    }
    this.label = name;
    this.instruction = next;
    return true;
};

Engine.prototype.answer = function answer(text) {
    this.render.flush();
    if (text === 'quit') {
        this.interlocutor.close();
        return;
    }
    // istanbul ignore next
    if (text === 'bt') {
        this.render.clear();
        this.top.log();
        this.prompt();
        return;
    }
    var n = +text;
    if (n >= 1 && n <= this.options.length) {
        this.render.clear();
        if (this.goto(this.options[n - 1].branch)) {
            this.flush();
            this.continue();
        }
    // istanbul ignore next
    } else if (this.keywords[text]) {
        this.render.clear();
        if (this.goto(this.keywords[text])) {
            this.flush();
            this.continue();
        }
    } else {
        this.render.pardon();
        this.prompt();
    }
};

Engine.prototype.display = function display() {
    this.render.display();
};

Engine.prototype.prompt = function prompt() {
    this.display();
    for (var i = 0; i < this.options.length; i++) {
        var option = this.options[i];
        this.render.option(i + 1, option.label);
    }
    this.interlocutor.question();
};

Engine.prototype.flush = function flush() {
    this.options.length = 0;
    this.keywords = {};
};

function Global(randomer) {
    this.scope = Object.create(null);
    this.randomer = randomer;
    this.next = null;
}

Global.prototype.get = function get(name) {
    return this.scope[name] || 0;
};

Global.prototype.set = function set(name, value) {
    this.scope[name] = value;
};

Global.prototype.random = function random() {
    return this.randomer.random();
};

// istanbul ignore next
Global.prototype.log = function log() {
    var globals = Object.keys(this.scope);
    for (var i = 0; i < globals.length; i++) {
        var name = globals[i];
        var value = this.scope[name];
        console.log(name + ' = ' + value);
    }
    render.paragraph();
};

// istanbul ignore next
Global.prototype.at = function at() {
    return '';
};

function Frame(caller, locals, next, branch) {
    this.locals = locals;
    this.scope = Object.create(null);
    for (var i = 0; i < locals.length; i++) {
        this.scope[locals[i]] = 0;
    }
    this.caller = caller;
    this.next = next;
    this.branch = branch;
}

Frame.prototype.get = function get(name) {
    if (this.locals.indexOf(name) >= 0) {
        return this.scope[name];
    }
    return this.caller.get(name);
};

Frame.prototype.set = function set(name, value) {
    // istanbul ignore else
    if (this.locals.indexOf(name) >= 0) {
        this.scope[name] = value;
        return;
    }
    this.caller.set(name, value);
};

Frame.prototype.random = function random() {
    return this.caller.random();
};

// istanbul ignore next
Frame.prototype.log = function log() {
    console.log('--- ' + this.branch + ' -> ' + this.next);
    for (var i = 0; i < this.locals.length; i++) {
        var name = this.locals[i];
        var value = this.scope[name];
        console.log(name + ' = ' + value);
    }
};

// istanbul ignore next
Frame.prototype.at = function at() {
    return this.caller.at() + '/' + this.branch;
};

}],["evaluate.js","inkblot","evaluate.js",{},function (require, exports, module, __filename, __dirname){

// inkblot/evaluate.js
// -------------------

'use strict';

module.exports = evaluate;

function evaluate(scope, args) {
    var name = args[0];
    if (binary[name]) {
        return binary[name](
            evaluate(scope, args[1]),
            evaluate(scope, args[2]),
            scope
        );
    // istanbul ignore next
    } else if (unary[name]) {
        return unary[name](evaluate(scope, args[1]));
    } else if (name === 'val') {
        return args[1];
    // istanbul ignore else
    } else if (name === 'get') {
        return scope.get(args[1]);
    }
    // istanbul ignore next
    throw new Error('Unexpected operator ' + args[0]);
}

var binary = {
    '+': function (x, y) {
        return x + y;
    },
    '-': function (x, y) {
        return x - y;
    },
    '*': function (x, y) {
        return x * y;
    },
    '/': function (x, y) {
        return (x / y) >>> 0;
    },
    '%': function (x, y) {
        return x % y;
    },
    'v': function (x, y) {
        return x || y ? 1 : 0;
    },
    '^': function (x, y) {
        return x && y ? 1 : 0;
    },
    '>=': function (x, y) {
        return x >= y ? 1 : 0;
    },
    '>': function (x, y) {
        return x > y ? 1 : 0;
    },
    '<=': function (x, y) {
        return x <= y ? 1 : 0;
    },
    '<': function (x, y) {
        return x < y ? 1 : 0;
    },
    '==': function (x, y) {
        return x === y ? 1 : 0;
    },
    '!=': function (x, y) {
        return x != y ? 1 : 0;
    },
    '#': function (x, y) {
        return hilbert(x, y);
    },
    '~': function (x, y, scope) {
        var r = 0;
        for (var i = 0; i < x; i++) {
            r += scope.random() * y;
        }
        return Math.floor(r);
    }
};

// istanbul ignore next
var unary = {
    '!': function (x) {
        return x ? 0 : 1;
    }
};

evaluate.hash = hash;
function hash(x) {
    x = ((x >>> 16) ^ x) * 0x45d9f3b;
    x = ((x >>> 16) ^ x) * 0x45d9f3b;
    x = ((x >>> 16) ^ x);
    return x >>> 0;
}

var msb = (-1 >>> 1) + 1;
var hsb = (-1 >>> 16) + 1;

function hilbert(x, y) {
    if (x < 0) {
        x += hsb;
    }
    if (y < 0) {
        y += hsb;
    }
    var rx = 0;
    var ry = y;
    var scalar = 0;
    for (var scale = msb; scale > 0; scale /= 2) {
        rx = x & scale;
        ry = y & scale;
        scalar += scale * ((3 * rx) ^ ry);
        // rotate
        if (!ry) {
            if (rx) {
                x = scale - 1 - x;
                y = scale - 1 - y;
            }
            // transpose
            var t = x;
            x = y;
            y = t;
        }
    }
    return scalar;
}

}],["examples/archery.json","inkblot/examples","archery.json",{},function (require, exports, module, __filename, __dirname){

// inkblot/examples/archery.json
// -----------------------------

module.exports = {
    "start": {
        "type": "set",
        "variable": "gold",
        "expression": [
            "val",
            2
        ],
        "parameter": false,
        "next": "start.1"
    },
    "start.1": {
        "type": "set",
        "variable": "arrow",
        "expression": [
            "val",
            0
        ],
        "parameter": false,
        "next": "start.2"
    },
    "start.2": {
        "type": "set",
        "variable": "hit",
        "expression": [
            "val",
            0
        ],
        "parameter": false,
        "next": "start.3"
    },
    "start.3": {
        "type": "text",
        "text": "You enter the fletcher’s shop. The fletcher beckons, “There are arrows for sale and a range out back to try your skill and fortune. For each score hit, you win more gold!”",
        "lift": "",
        "drop": " ",
        "next": "start.4"
    },
    "start.4": {
        "type": "paragraph",
        "next": "shop"
    },
    "shop": {
        "type": "text",
        "text": "You have",
        "lift": "",
        "drop": " ",
        "next": "shop.1"
    },
    "shop.1": {
        "type": "switch",
        "expression": [
            "get",
            "arrow"
        ],
        "variable": null,
        "value": 0,
        "mode": "walk",
        "branches": [
            "shop.1.1",
            "shop.1.2",
            "shop.1.3"
        ]
    },
    "shop.1.1": {
        "type": "text",
        "text": "no arrows",
        "lift": "",
        "drop": "",
        "next": "shop.2"
    },
    "shop.1.2": {
        "type": "text",
        "text": "an arrow",
        "lift": "",
        "drop": "",
        "next": "shop.2"
    },
    "shop.1.3": {
        "type": "print",
        "expression": [
            "get",
            "arrow"
        ],
        "next": "shop.1.3.1"
    },
    "shop.1.3.1": {
        "type": "text",
        "text": "arrows",
        "lift": " ",
        "drop": "",
        "next": "shop.2"
    },
    "shop.2": {
        "type": "switch",
        "expression": [
            "get",
            "arrow"
        ],
        "variable": null,
        "value": 0,
        "mode": "walk",
        "branches": [
            "shop.2.1",
            "shop.2.2"
        ]
    },
    "shop.2.1": {
        "type": "switch",
        "expression": [
            "get",
            "gold"
        ],
        "variable": null,
        "value": 0,
        "mode": "walk",
        "branches": [
            "shop.2.1.0.1",
            "shop.2.1.0.2"
        ]
    },
    "shop.2.1.0.1": {
        "type": "text",
        "text": "and",
        "lift": " ",
        "drop": " ",
        "next": "shop.3"
    },
    "shop.2.1.0.2": {
        "type": "text",
        "text": "but",
        "lift": " ",
        "drop": " ",
        "next": "shop.3"
    },
    "shop.2.2": {
        "type": "text",
        "text": "and",
        "lift": " ",
        "drop": " ",
        "next": "shop.3"
    },
    "shop.3": {
        "type": "call",
        "label": "gold",
        "branch": "gold",
        "next": "shop.4"
    },
    "shop.4": {
        "type": "text",
        "text": ".",
        "lift": "",
        "drop": " ",
        "next": "shop.5"
    },
    "shop.5": {
        "type": "jump",
        "condition": [
            "==",
            [
                "get",
                "gold"
            ],
            [
                "val",
                0
            ]
        ],
        "branch": "shop.6",
        "next": "shop.8"
    },
    "shop.6": {
        "type": "jump",
        "condition": [
            "==",
            [
                "get",
                "arrow"
            ],
            [
                "val",
                0
            ]
        ],
        "branch": "exit",
        "next": "shop.8"
    },
    "shop.8": {
        "type": "jump",
        "condition": [
            "!=",
            [
                "get",
                "gold"
            ],
            [
                "val",
                0
            ]
        ],
        "branch": "shop.9",
        "next": "shop.10"
    },
    "shop.9": {
        "type": "option",
        "label": "Buy 3 arrows for a gold piece.",
        "keywords": [],
        "branch": "shop.9.1",
        "next": "shop.10"
    },
    "shop.9.1": {
        "type": "text",
        "text": "You b",
        "lift": "",
        "drop": "",
        "next": "shop.9.2"
    },
    "shop.9.2": {
        "type": "text",
        "text": "uy 3 arrows for a gold piece.",
        "lift": "",
        "drop": " ",
        "next": "shop.9.3"
    },
    "shop.9.3": {
        "type": "set",
        "variable": "gold",
        "expression": [
            "-",
            [
                "get",
                "gold"
            ],
            [
                "val",
                1
            ]
        ],
        "parameter": false,
        "next": "shop.9.4"
    },
    "shop.9.4": {
        "type": "set",
        "variable": "arrow",
        "expression": [
            "+",
            [
                "get",
                "arrow"
            ],
            [
                "val",
                3
            ]
        ],
        "parameter": false,
        "next": "shop"
    },
    "shop.10": {
        "type": "jump",
        "condition": [
            ">=",
            [
                "get",
                "arrow"
            ],
            [
                "val",
                4
            ]
        ],
        "branch": "shop.11",
        "next": "shop.12"
    },
    "shop.11": {
        "type": "option",
        "label": "Sell 4 arrows for a gold piece.",
        "keywords": [],
        "branch": "shop.11.1",
        "next": "shop.12"
    },
    "shop.11.1": {
        "type": "text",
        "text": "You s",
        "lift": "",
        "drop": "",
        "next": "shop.11.2"
    },
    "shop.11.2": {
        "type": "text",
        "text": "ell 4 arrows for a gold piece.",
        "lift": "",
        "drop": " ",
        "next": "shop.11.3"
    },
    "shop.11.3": {
        "type": "set",
        "variable": "gold",
        "expression": [
            "+",
            [
                "get",
                "gold"
            ],
            [
                "val",
                1
            ]
        ],
        "parameter": false,
        "next": "shop.11.4"
    },
    "shop.11.4": {
        "type": "set",
        "variable": "arrow",
        "expression": [
            "-",
            [
                "get",
                "arrow"
            ],
            [
                "val",
                4
            ]
        ],
        "parameter": false,
        "next": "shop"
    },
    "shop.12": {
        "type": "option",
        "label": "Visit the archery range.",
        "keywords": [],
        "branch": "shop.12.1",
        "next": "shop.13"
    },
    "shop.12.1": {
        "type": "text",
        "text": "You walk through the door to",
        "lift": "",
        "drop": "",
        "next": "shop.12.2"
    },
    "shop.12.2": {
        "type": "text",
        "text": "the archery range.",
        "lift": " ",
        "drop": " ",
        "next": "range"
    },
    "shop.13": {
        "type": "option",
        "label": "Leave the store",
        "keywords": [],
        "branch": "exit",
        "next": "shop.14"
    },
    "shop.14": {
        "type": "prompt"
    },
    "range": {
        "type": "text",
        "text": "You have",
        "lift": "",
        "drop": " ",
        "next": "range.1"
    },
    "range.1": {
        "type": "switch",
        "expression": [
            "get",
            "arrow"
        ],
        "variable": null,
        "value": 0,
        "mode": "walk",
        "branches": [
            "range.1.1",
            "range.1.2",
            "range.1.3"
        ]
    },
    "range.1.1": {
        "type": "text",
        "text": "no arrows",
        "lift": "",
        "drop": "",
        "next": "range.2"
    },
    "range.1.2": {
        "type": "text",
        "text": "an arrow",
        "lift": "",
        "drop": "",
        "next": "range.2"
    },
    "range.1.3": {
        "type": "print",
        "expression": [
            "get",
            "arrow"
        ],
        "next": "range.1.3.1"
    },
    "range.1.3.1": {
        "type": "text",
        "text": "arrows",
        "lift": " ",
        "drop": "",
        "next": "range.2"
    },
    "range.2": {
        "type": "text",
        "text": ".",
        "lift": "",
        "drop": " ",
        "next": "range.3"
    },
    "range.3": {
        "type": "jump",
        "condition": [
            "!=",
            [
                "get",
                "arrow"
            ],
            [
                "val",
                0
            ]
        ],
        "branch": "range.4",
        "next": "range.5"
    },
    "range.4": {
        "type": "option",
        "label": "Shoot an arrow",
        "keywords": [],
        "branch": "range.4.1",
        "next": "range.5"
    },
    "range.4.1": {
        "type": "text",
        "text": "You s",
        "lift": "",
        "drop": "",
        "next": "range.4.2"
    },
    "range.4.2": {
        "type": "text",
        "text": "hoot an arrow",
        "lift": "",
        "drop": " ",
        "next": "range.4.3"
    },
    "range.4.3": {
        "type": "set",
        "variable": "arrow",
        "expression": [
            "-",
            [
                "get",
                "arrow"
            ],
            [
                "val",
                1
            ]
        ],
        "parameter": false,
        "next": "range.4.4"
    },
    "range.4.4": {
        "type": "switch",
        "expression": [
            "get",
            "range.4.4"
        ],
        "variable": null,
        "value": 0,
        "mode": "rand",
        "branches": [
            "range.4.4.1",
            "range.4.4.2",
            "range.4.4.3"
        ]
    },
    "range.4.4.1": {
        "type": "text",
        "text": "and hit the target, winning 1 gold piece!",
        "lift": "",
        "drop": " ",
        "next": "range.4.4.1.1"
    },
    "range.4.4.1.1": {
        "type": "set",
        "variable": "gold",
        "expression": [
            "+",
            [
                "get",
                "gold"
            ],
            [
                "val",
                1
            ]
        ],
        "parameter": false,
        "next": "range.4.4.1.2"
    },
    "range.4.4.1.2": {
        "type": "set",
        "variable": "hit",
        "expression": [
            "+",
            [
                "get",
                "hit"
            ],
            [
                "val",
                1
            ]
        ],
        "parameter": false,
        "next": "range"
    },
    "range.4.4.2": {
        "type": "goto",
        "next": "range.4.5"
    },
    "range.4.4.3": {
        "type": "goto",
        "next": "range.4.5"
    },
    "range.4.5": {
        "type": "text",
        "text": "and miss.",
        "lift": " ",
        "drop": " ",
        "next": "range"
    },
    "range.5": {
        "type": "option",
        "label": "Return to the archery shop.",
        "keywords": [],
        "branch": "range.5.1",
        "next": "range.6"
    },
    "range.5.1": {
        "type": "text",
        "text": "You r",
        "lift": "",
        "drop": "",
        "next": "range.5.2"
    },
    "range.5.2": {
        "type": "text",
        "text": "eturn to the archery shop.",
        "lift": "",
        "drop": " ",
        "next": "shop"
    },
    "range.6": {
        "type": "prompt"
    },
    "gold": {
        "type": "subroutine",
        "locals": [],
        "next": "gold.1"
    },
    "gold.1": {
        "type": "switch",
        "expression": [
            "get",
            "gold"
        ],
        "variable": null,
        "value": 0,
        "mode": "walk",
        "branches": [
            "gold.1.1",
            "gold.1.2",
            "gold.1.3"
        ]
    },
    "gold.1.1": {
        "type": "text",
        "text": "no gold",
        "lift": "",
        "drop": "",
        "next": null
    },
    "gold.1.2": {
        "type": "text",
        "text": "a gold piece",
        "lift": "",
        "drop": "",
        "next": null
    },
    "gold.1.3": {
        "type": "print",
        "expression": [
            "get",
            "gold"
        ],
        "next": "gold.1.3.1"
    },
    "gold.1.3.1": {
        "type": "text",
        "text": "gold",
        "lift": " ",
        "drop": "",
        "next": null
    },
    "exit": {
        "type": "text",
        "text": "You depart the store through the back door with",
        "lift": " ",
        "drop": " ",
        "next": "exit.1"
    },
    "exit.1": {
        "type": "call",
        "label": "gold",
        "branch": "gold",
        "next": "exit.2"
    },
    "exit.2": {
        "type": "text",
        "text": ".",
        "lift": "",
        "drop": " ",
        "next": "exit.3"
    },
    "exit.3": {
        "type": "jump",
        "condition": [
            "!=",
            [
                "get",
                "hit"
            ],
            [
                "val",
                0
            ]
        ],
        "branch": "exit.4",
        "next": null
    },
    "exit.4": {
        "type": "text",
        "text": "All told, you scored",
        "lift": " ",
        "drop": " ",
        "next": "exit.5"
    },
    "exit.5": {
        "type": "print",
        "expression": [
            "get",
            "hit"
        ],
        "next": "exit.6"
    },
    "exit.6": {
        "type": "text",
        "text": "hit",
        "lift": " ",
        "drop": "",
        "next": "exit.7"
    },
    "exit.7": {
        "type": "switch",
        "expression": [
            "get",
            "hit"
        ],
        "variable": null,
        "value": 0,
        "mode": "walk",
        "branches": [
            "exit.7.1",
            "exit.7.2",
            "exit.7.3"
        ]
    },
    "exit.7.1": {
        "type": "text",
        "text": "s",
        "lift": "",
        "drop": "",
        "next": "exit.8"
    },
    "exit.7.2": {
        "type": "goto",
        "next": "exit.8"
    },
    "exit.7.3": {
        "type": "text",
        "text": "s",
        "lift": "",
        "drop": "",
        "next": "exit.8"
    },
    "exit.8": {
        "type": "text",
        "text": ".",
        "lift": "",
        "drop": " ",
        "next": null
    }
}

}],["index.js","inkblot","index.js",{"./engine":1,"./examples/archery.json":3,"./document":0},function (require, exports, module, __filename, __dirname){

// inkblot/index.js
// ----------------

'use strict';
var Engine = require('./engine');
var story = require('./examples/archery.json');
var Document = require('./document');
var doc = new Document(document.getElementById('body'));
var engine = new Engine(story, 'start', doc, doc);
doc.clear();
engine.continue();

window.onkeypress = function onkeypress(event) {
    var key = event.code;
    var match = /^Digit(\d+)$/.exec(key);
    if (match) {
        engine.answer(match[1]);
    }
};

}],["path.js","inkblot","path.js",{},function (require, exports, module, __filename, __dirname){

// inkblot/path.js
// ---------------

'use strict';

exports.toName = pathToName;

function pathToName(path) {
    var name = path[0];
    var i;
    for (i = 1; i < path.length - 1; i++) {
        name += '.' + path[i];
    }
    var last = path[i];
    if (path.length > 1 && last !== 0) {
        name += '.' + last;
    }
    return name;
}

exports.next = nextPath;

function nextPath(path) {
    path = path.slice();
    path[path.length - 1]++;
    return path;
}

exports.firstChild = firstChildPath;

function firstChildPath(path) {
    path = path.slice();
    path.push(1);
    return path;
}

exports.zerothChild = zerothChildPath;

function zerothChildPath(path) {
    path = path.slice();
    path.push(0);
    return path;
}

}],["story.js","inkblot","story.js",{"pop-equals":8,"./path":5},function (require, exports, module, __filename, __dirname){

// inkblot/story.js
// ----------------

'use strict';

var equals = require('pop-equals');
var Path = require('./path');

var constructors = {};

module.exports = Story;

function Story() {
    this.states = {};
    Object.seal(this);
}

Story.constructors = constructors;

Story.prototype.create = function create(path, type, text) {
    var name = Path.toName(path);
    var Node = constructors[type];
    // istanbul ignore if
    if (!Node) {
        throw new Error('No node constructor for type: ' + type);
    }
    var node = new Node(text);
    this.states[name] = node;
    return node;
};

constructors.text = Text;
function Text(text) {
    this.type = 'text';
    this.text = text;
    this.lift = ' ';
    this.drop = ' ';
    this.next = null;
    Object.seal(this);
}
Text.prototype.tie = tie;
// istanbul ignore next
Text.prototype.describe = function describe() {
    return (this.lift ? '' : '-') +
        this.text.slice(0, 30) +
        (this.drop ? '' : '-');
};
Text.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.text === that.text &&
        this.lift === that.lift &&
        this.drop === that.drop &&
        this.next === that.next;
};

constructors.print = Print;
function Print(expression) {
    this.type = 'print';
    this.expression = expression;
    this.next = null;
    Object.seal(this);
}
Print.prototype.tie = tie;
// istanbul ignore next
Print.prototype.describe = function describe() {
    return S(this.expression);
};
Print.prototype.equals = function _equals(that) {
    return this.type === that.type &&
        equals(this.expression, that.expression) &&
        this.next === that.next;
};

constructors.option = Option;
function Option(label) {
    this.type = 'option';
    this.label = label;
    this.keywords = [];
    this.branch = null;
    this.next = null;
    Object.seal(this);
}
Option.prototype.tie = tie;
// istanbul ignore next
Option.prototype.describe = function describe() {
    return this.label + ' ' + A(this.branch);
};
Option.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.label === that.label &&
        // Don't care about keywords for the nonce
        this.branch == that.branch &&
        this.next === that.next;
};

constructors.goto = Goto;
function Goto(next) {
    this.type = 'goto';
    this.next = next || null;
    Object.seal(this);
}
Goto.prototype.tie = tie;
// istanbul ignore next
Goto.prototype.describe = function describe() {
    return this.next;
};
Goto.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.next === that.next;
};

constructors.call = Call;
function Call(label) {
    this.type = 'call';
    this.label = label;
    this.branch = null;
    this.next = null;
    Object.seal(this);
}
Call.prototype.tie = tie;
// istanbul ignore next
Call.prototype.describe = function describe() {
    return this.branch + '() -> ' + this.next;
};
Call.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.label === that.label &&
        this.branch === that.branch &&
        this.next === that.next;
};

constructors.subroutine = Subroutine;
function Subroutine(locals) {
    this.type = 'subroutine';
    this.locals = locals;
    this.next = null;
    Object.seal(this);
};
Subroutine.prototype.tie = tie;
// istanbul ignore next
Subroutine.prototype.describe = function describe() {
    return '(' + this.locals.join(', ') + ')';
};
Subroutine.prototype.equals = function _equals(that) {
    return this.type === that.type &&
        equals(this.locals, that.locals) &&
        this.next === that.next;
};

constructors.jump = Jump;
function Jump(condition) {
    this.type = 'jump';
    this.condition = condition;
    this.branch = null;
    this.next = null;
    Object.seal(this);
}
Jump.prototype.tie = tie;
// istanbul ignore next
Jump.prototype.describe = function describe() {
    return this.branch + ' if ' + S(this.condition);
};
Jump.prototype.equals = function _equals(that) {
    return this.type === that.type &&
        equals(this.condition, that.condition) &&
        this.branch === that.branch &&
        this.next === that.next;
};

constructors.switch = Switch;
function Switch(expression) {
    this.type = 'switch';
    this.expression = expression;
    this.variable = null;
    this.value = 0;
    this.mode = null;
    this.branches = [];
    Object.seal(this);
}
Switch.prototype.tie = tie;
// istanbul ignore next
Switch.prototype.describe = function describe() {
    if (this.variable) {
        return this.mode + ' (' + this.variable + '+' +  this.value + ') ' + S(this.expression);
    } else {
        return this.mode + ' ' + S(this.expression);
    }
};
Switch.prototype.equals = function _equals(that) {
    return this.type === that.type &&
        equals(this.expression, that.expression) &&
        this.value === that.value &&
        this.mode === that.mode &&
        equals(this.branches, that.branches);
};

constructors.set = Set;
function Set(variable) {
    this.type = 'set';
    this.variable = variable;
    this.expression = null;
    this.parameter = false;
    this.next = null;
    Object.seal(this);
}
Set.prototype.tie = tie;
// istanbul ignore next
Set.prototype.describe = function describe() {
    return this.variable + ' ' + S(this.expression);
};
Set.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.variable === that.variable &&
        this.parameter === Boolean(that.parameter) &&
        this.next === that.next;
};

constructors.break = Break;
function Break(variable) {
    this.type = 'break';
    this.next = null;
    Object.seal(this);
}
Break.prototype.tie = tie;
// istanbul ignore next
Break.prototype.describe = function describe() {
    return '';
};
Break.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.next === that.next;
};

constructors.paragraph = Paragraph;
function Paragraph(variable) {
    this.type = 'paragraph';
    this.next = null;
    Object.seal(this);
}
Paragraph.prototype.tie = tie;
// istanbul ignore next
Paragraph.prototype.describe = function describe() {
    return '';
};
Paragraph.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.next === that.next;
};

constructors.startJoin = StartJoin;
function StartJoin(variable) {
    this.type = 'startJoin';
    this.text = '';
    this.lift = '';
    this.drop = '';
    this.delimiter = ',';
    this.next = null;
    Object.seal(this);
}
StartJoin.prototype.tie = tie;
// istanbul ignore next
StartJoin.prototype.describe = function describe() {
    return '';
};
StartJoin.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.next === that.next;
};

constructors.stopJoin = StopJoin;
function StopJoin(variable) {
    this.type = 'stopJoin';
    this.next = null;
    Object.seal(this);
}
StopJoin.prototype.tie = tie;
// istanbul ignore next
StopJoin.prototype.describe = function describe() {
    return '';
};
StopJoin.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.next === that.next;
};

constructors.delimit = Delimit;
function Delimit(variable) {
    this.type = 'delimit';
    this.delimiter = ',';
    this.next = null;
    Object.seal(this);
}
Delimit.prototype.tie = tie;
// istanbul ignore next
Delimit.prototype.describe = function describe() {
    return ',';
};
Delimit.prototype.equals = function equals(that) {
    return this.type === that.type &&
        this.delimiter === that.delimiter &&
        this.next === that.next;
};

constructors.prompt = Prompt;
function Prompt(variable) {
    this.type = 'prompt';
    Object.seal(this);
}
Prompt.prototype.tie = tie;
// istanbul ignore next
Prompt.prototype.describe = function describe() {
    return '';
};
Prompt.prototype.equals = function equals(that) {
    return this.type === that.type;
};

function tie(end) {
    this.next = end;
}

// istanbul ignore next
function S(args) {
    if (args[0] === 'val' || args[0] === 'get') {
        return args[1];
    } else {
        return '(' + args[0] + ' ' + args.slice(1).map(S).join(' ') + ')';
    }
}

// istanbul ignore next
function A(label) {
    if (label == null) {
        return '<-';
    } else {
        return '-> ' + label;
    }
}

}],["mini-map.js","mini-map","mini-map.js",{},function (require, exports, module, __filename, __dirname){

// mini-map/mini-map.js
// --------------------

"use strict";

module.exports = MiniMap;
function MiniMap() {
    this.keys = [];
    this.values = [];
}

MiniMap.prototype.has = function (key) {
    var index = this.keys.indexOf(key);
    return index >= 0;
};

MiniMap.prototype.get = function (key) {
    var index = this.keys.indexOf(key);
    if (index >= 0) {
        return this.values[index];
    }
};

MiniMap.prototype.set = function (key, value) {
    var index = this.keys.indexOf(key);
    if (index < 0) {
        index = this.keys.length;
    }
    this.keys[index] = key;
    this.values[index] = value;
};

MiniMap.prototype["delete"] = function (key) {
    var index = this.keys.indexOf(key);
    if (index >= 0) {
        this.keys.splice(index, 1);
        this.values.splice(index, 1);
    }
};

MiniMap.prototype.clear = function () {
    this.keys.length = 0;
    this.values.length = 0;
};


}],["pop-equals.js","pop-equals","pop-equals.js",{"mini-map":7},function (require, exports, module, __filename, __dirname){

// pop-equals/pop-equals.js
// ------------------------

"use strict";

var MiniMap = require("mini-map");
var getPrototypeOf = Object.getPrototypeOf;
var objectPrototype = Object.prototype;

/**
    Performs a polymorphic, type-sensitive deep equivalence comparison of any
    two values.

    <p>As a basic principle, any value is equivalent to itself (as in
    identity), any boxed version of itself (as a <code>new Number(10)</code> is
    to 10), and any deep clone of itself.

    <p>Equivalence has the following properties:

    <ul>
        <li><strong>polymorphic:</strong>
            If the given object is an instance of a type that implements a
            methods named "equals", this function defers to the method.  So,
            this function can safely compare any values regardless of type,
            including undefined, null, numbers, strings, any pair of objects
            where either implements "equals", or object literals that may even
            contain an "equals" key.
        <li><strong>type-sensitive:</strong>
            Incomparable types are not equal.  No object is equivalent to any
            array.  No string is equal to any other number.
        <li><strong>deep:</strong>
            Collections with equivalent content are equivalent, recursively.
        <li><strong>equivalence:</strong>
            Identical values and objects are equivalent, but so are collections
            that contain equivalent content.  Whether order is important varies
            by type.  For Arrays and lists, order is important.  For Objects,
            maps, and sets, order is not important.  Boxed objects are mutally
            equivalent with their unboxed values, by virtue of the standard
            <code>valueOf</code> method.
    </ul>
    @param this
    @param that
    @returns {Boolean} whether the values are deeply equivalent
*/
module.exports = equals;
function equals(a, b, equals, memo) {
    equals = equals || module.exports;
    // unbox objects
    if (a && typeof a.valueOf === "function") {
        a = a.valueOf();
    }
    if (b && typeof b.valueOf === "function") {
        b = b.valueOf();
    }
    if (a === b)
        return true;
    // NaN !== NaN, but they are equal.
    // NaNs are the only non-reflexive value, i.e., if x !== x,
    // then x is a NaN.
    // isNaN is broken: it converts its argument to number, so
    // isNaN("foo") => true
    // We have established that a !== b, but if a !== a && b !== b, they are
    // both NaN.
    if (a !== a && b !== b)
        return true;
    if (!a || !b)
        return false;
    if (typeof a === "object") {
        memo = memo || new MiniMap();
        if (memo.has(a)) {
            return true;
        }
        memo.set(a, true);
    }
    if (typeof a.equals === "function") {
        return a.equals(b, equals, memo);
    }
    // commutative
    if (typeof b.equals === "function") {
        return b.equals(a, equals, memo);
    }
    if ((Array.isArray(a) || Array.isArray(b)) && a.length !== b.length) {
        return false;
    }
    if (typeof a === "object" && typeof b === "object") {
        if (
            getPrototypeOf(a) === objectPrototype &&
            getPrototypeOf(b) === objectPrototype ||
            Array.isArray(a) ||
            Array.isArray(b)
        ) {
            for (var name in a) {
                if (!equals(a[name], b[name], equals, memo)) {
                    return false;
                }
            }
            for (var name in b) {
                if (!(name in a)) {
                    return false;
                }
            }
            return true;
        }
    }
    return false;
}

// Because a return value of 0 from a `compare` function  may mean either
// "equals" or "is incomparable", `equals` cannot be defined in terms of
// `compare`.  However, `compare` *can* be defined in terms of `equals` and
// `lessThan`.  Again however, more often it would be desirable to implement
// all of the comparison functions in terms of compare rather than the other
// way around.


}]])("inkblot/index.js")
