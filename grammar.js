'use strict';

var Path = require('./path');
var story = require('./story');
var expression = require('./expression');

exports.start = start;

function start(story) {
    var path = Path.start();
    var stop = new Stop(story);
    var start = story.create(path, 'goto', null);
    return new Knot(story, Path.zerothChild(path), stop, [start], []);
}

function Stop(story) {
    this.type = 'stop';
    this.story = story;
    Object.seal(this);
}

// istanbul ignore next
Stop.prototype.next = function next(type, space, text, scanner) {
    // istanbul ignore else
    if (type !== 'stop') {
        this.story.error('Expected end of file, got ' + type + '/' + text + ' at ' + scanner.position());
    }
    return new End();
};

Stop.prototype.return = function _return() {
    return this;
};

function End() {
    this.type = 'end';
    Object.seal(this);
}

// istanbul ignore next
End.prototype.next = function next(type, space, text, scanner) {
    return this;
};

// ends are tied to the next instruction
// jumps are tied off after the next encountered prompt
function Knot(story, path, parent, ends, jumps) {
    this.type = 'knot';
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.jumps = jumps;
    this.story = story;
    Object.seal(this);
}

Knot.prototype.next = function next(type, space, text, scanner) {
    if (type === 'symbol'|| type === 'alphanum' || type === 'number' || type === 'literal') {
        return new Text(this.story, this.path, space, text, this, this.ends);
    }  else if (type === 'token') {
        if (text === '{') {
            return new Block(this.story, this.path, this, this.ends);
        } else if (text === '@') {
            return expression.variable(this.story, new ExpectLabel(this.story, this.path, this, this.ends));
        } else if (text === '->') {
            return expression.variable(this.story, new Goto(this.story, this.path, this, this.ends));
        } else if (text === '<-') {
            // Implicitly tie ends to null by dropping them.
            // Continue carrying jumps to the next encountered prompt.
            return new Knot(this.story, this.path, this.parent, [], this.jumps);
        } else if (text === '/') {
            var node = this.story.create(this.path, 'break');
            tie(this.ends, this.path);
            return new Knot(this.story, Path.next(this.path), this.parent, [node], this.jumps);
        }
    } else if (type === 'start') {
        if (text === '+' || text === '*') {
            tie(this.ends, this.path);
            return new Option(text, this.story, this.path, this, []);
        } else if (text === '-') {
            return new Knot(this.story, this.path, new Indent(this.story, this), this.ends, []);
        } else { // if (text === '>') {
            var node = this.story.create(this.path, 'prompt');
            // tie off ends to the prompt.
            tie(this.ends, this.path);
            // promote jumps to ends, tying them off after the prompt.
            return new Knot(this.story, Path.next(this.path), new Indent(this.story, this), this.jumps, []);
        }
    } else if (type === 'dash') {
        var node = this.story.create(this.path, 'paragraph');
        tie(this.ends, this.path);
        return new Knot(this.story, Path.next(this.path), this.parent, [node], this.jumps);
    } else if (type === 'break') {
        return this;
    }
    if (type === 'stop' || text === '|' || text === ']' || text === '[' || text === '}') {
        return this.parent.return(this.path, this.ends, this.jumps, scanner)
            .next(type, space, text, scanner);
    }
    return new Text(this.story, this.path, space, text, this, this.ends);
};

Knot.prototype.return = function _return(path, ends, jumps, scanner) {
    // All rules above (in next) guarantee that this.ends has been passed to
    // any rule that might use them. If the rule fails to use them, they must
    // return them. However, jumps are never passed to any rule that returns.
    return new Knot(this.story, path, this.parent, ends, this.jumps.concat(jumps));
};

function Indent(story, parent) {
    this.story = story;
    this.parent = parent;
    Object.seal(this);
}

Indent.prototype.return = function _return(path, ends, jumps, scanner) {
    return new Expect('stop', '', this.story, path, this.parent, ends, jumps);
};

function Text(story, path, lift, text, parent, ends) {
    this.type = 'text';
    this.story = story;
    this.path = path;
    this.lift = lift;
    this.text = text;
    this.parent = parent;
    this.ends = ends;
}

Text.prototype.next = function next(type, space, text, scanner) {
    if (type === 'alphanum' || type === 'number' || type === 'symbol' || type === 'literal') {
        this.text += space + text;
        return this;
    } else {
        tie(this.ends, this.path);
        var node = this.story.create(this.path, 'text', this.text);
        node.lift = this.lift;
        node.drop = space;
        return this.parent.return(Path.next(this.path), [node], [], scanner)
            .next(type, space, text, scanner);
    }
};

function Pretext(lift, text, drop) {
    this.lift = lift || '';;
    this.text = text || '';
    this.drop = drop || '';
}

function Option(leader, story, path, parent, ends) {
    this.type = 'option';
    this.leader = leader;
    this.story = story;
    this.path = path;
    this.name = Path.toName(path);
    this.parent = parent;
    this.ends = ends; // to tie off to the next option
    this.jumps = []; // to tie off to the next node after the next prompt
    this.question = new Pretext();
    this.answer = new Pretext();
    this.common = new Pretext();
    this.position = 0;
    this.direction = 1;
    Object.seal(this);
}

//    You then s   [S]      ay Hello, World!
//    0   1    1    2 3     4  5      5
//    Answer  Question Common
//
//    "Hello, World ]!"        [," you reply.
//    0       1     -2      -3 4   5   5
//    Common         Question  Answer
Option.prototype.next = function next(type, space, text, scanner) {
    if ((type === 'symbol' || type === 'alphanum' || type === 'number') && this.position === 0) {
        this.answer.lift = space;
        this.answer.text = text;
        this.position = 1;
        return this;
    } else if ((type === 'symbol' || type === 'alphanum' || type === 'number') && this.position === 1) {
        this.answer.text += space + text;
        return this;
    } else if (type === 'token' && text === '[' && (this.position === 0 || this.position === 1)) {
        this.position = 2;
        return this;
    } else if (type === 'token' && text === ']' && (this.position === 0 || this.position === 1)) {
        this.direction = -1;
        this.position = -2;
        return this;
    } else if ((type === 'symbol' || type === 'alphanum' || type === 'number') && this.position === 2 * this.direction) {
        this.answer.drop = space;
        this.question.lift = space;
        this.question.text = text;
        this.position = 3 * this.direction;
        return this;
    } else if ((type === 'symbol' || type === 'alphanum' || type === 'number') && this.position === 3 * this.direction) {
        this.question.text += space + text;
        return this;
    } else if (type === 'token' && text === ']' && (this.position === 2 || this.position === 3)) {
        this.question.drop = space;
        this.position = 4;
        return this;
    } else if (type === 'token' && text === '[' && (this.position === -2 || this.position === -3)) {
        this.question.drop = space;
        this.position = 4;
        return this;
    } else if ((type === 'symbol' || type === 'alphanum' || type === 'number') && this.position === 4) {
        this.question.drop = space;
        this.common.lift = space;
        this.common.text = text;
        this.position = 5;
        return this;
    } else if ((type === 'symbol' || type === 'alphanum' || type === 'number') && this.position === 5) {
        this.common.text += space + text;
        return this;
    } else if (this.position === 0 || this.position === 1) {
        this.answer.drop = space;
        // If we get here, it means we only populated the answer, and didn't
        // see any bracket notation.
        // In this case, the "answer" we collected is actually the "common",
        // meaning it serves for both the question and answer for the option.
        return this.create(null, null, this.answer, this.direction, type, space, text, scanner);
    // istanbul ignore next
    } else if (this.position === 2 || this.position === 3) {
        this.story.error('Expected matching ], got ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, this.jumps);
    } else {
        this.common.drop = space;
        return this.create(this.answer, this.question, this.common, this.direction, type, space, text, scanner);
    }
};

Option.prototype.create = function create(answer, question, common, direction, type, space, text, scanner) {
    var variable = Path.toName(this.path);
    var path = this.path;

    if (this.leader === '*') {
        var jnz = this.story.create(path, 'jump', ['!=', ['get', variable], ['val', 0]]);
        var jnzBranch = new Branch(jnz);
        this.ends.push(jnzBranch);
        path = Path.firstChild(path);
        tie([jnz], path);
    }

    var option;
    if (question) {
        if (this.direction > 0) {
            option = this.story.create(path, 'option', question.text + question.drop + common.text);
        } else {
            option = this.story.create(path, 'option', answer.text + answer.drop + question.text);
        }
    } else {
        option = this.story.create(path, 'option', common.text);
    }
    this.ends.push(option);

    if (this.leader === '*') {
        path = Path.next(path);
    } else {
        path = Path.firstChild(path);
    }

    var prev = new Branch(option);
    var next;

    if (this.leader === '*') {
        next = this.story.create(path, 'set', variable);
        next.expression = ['+', ['get', variable], ['val', 1]];
        tie([prev], path);
        path = Path.next(path);
        prev = next;
    }

    if (answer && answer.text) {
        next = this.story.create(path, 'text', answer.text);
        next.lift = answer.lift;
        next.drop = answer.drop;
        tie([prev], path);
        path = Path.next(path);
        prev = next;
    }

    if (question && common.text) {
        next = this.story.create(path, 'text', common.text);
        next.lift = common.lift;
        next.drop = common.drop;
        tie([prev], path);
        path = Path.next(path);
        prev = next;
    }

    var state = new Knot(this.story, path, new Indent(this.story, this), [prev], []);

    if (text !== '/') {
        state = state.next(type, space, text, scanner);
    }

    return state;
};

Option.prototype.return = function _return(path, ends, jumps, scanner) {
    return this.parent.return(Path.next(this.path), this.ends, this.jumps.concat(ends, jumps));
};

function Branch(node) {
    this.type = 'branch';
    this.node = node;
    Object.seal(this);
}

Branch.prototype.tie = function tie(path) {
    this.node.branch = path;
};

function Rejoin(parent, branch) {
    this.parent = parent;
    this.branch = branch;
}

Rejoin.prototype.return = function _return(path, ends, jumps, scanner) {
    return this.parent.return(path, ends.concat([this.branch]), jumps, scanner);
};

function ExpectLabel(story, path, parent, ends) {
    this.type = 'label';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
}

ExpectLabel.prototype.return = function _return(expression, scanner) {
    // istanbul ignore else
    if (expression[0] === 'get') {
        return new MaybeSubroutine(this.story, this.path, this.parent, this.ends, expression[1]);
    } else {
        this.story.error('Expected label after =, got ' + JSON.stringify(expression) + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

function MaybeSubroutine(story, path, parent, ends, label) {
    this.type = 'maybe-subroutine';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.label = label;
}

MaybeSubroutine.prototype.next = function next(type, space, text, scanner) {
    if (type === 'symbol' && text === '(') {
        return new Subroutine(this.story, this.path, this, this.label);
    } else {
        var path = [this.label, 0];
        // place-holder goto thunk
        var label = this.story.create(path, 'goto', null);
        tie(this.ends, path);
        // ends also forwarded so they can be tied off if the goto is replaced.
        return new Knot(this.story, path, this.parent, this.ends.concat([label]), [])
            .next(type, space, text, scanner);
    }
};

MaybeSubroutine.prototype.return = function _return(path, ends, jumps, scanner) {
    // After a subroutine, connect prior ends.
    return this.parent.return(path, this.ends.concat(ends), jumps, scanner);
};

function Subroutine(story, path, parent, label) {
    this.type = 'subroutine';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.label = label;
    this.locals = [];
}

Subroutine.prototype.next = function next(type, space, text, scanner) {
    if (type === 'symbol' && text === ')') {
        var path = [this.label, 0];
        var label = this.story.create(path, 'goto', null);

        // Leave the loose ends from before the subroutine declaration for
        // after the subroutine declaration is complete.

        // The subroutine exists only for reference in calls.
        var sub = this.story.create(path, 'subroutine', this.locals);

        return new Knot(this.story, Path.next(path), this, [label, sub], []);
    // istanbul ignore else
    } else if (type === 'alphanum') {
        // TODO handle expression.variable
        this.locals.push(text);
        return this;
    } else {
        this.story.error('Expected variable name or close paren, got ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this, [], []);
    }
};

Subroutine.prototype.return = function _return(path, ends, jumps, scanner) {
    // Let loose ends of subroutine dangle to null.
    // Pick up the threads left before the subroutine declaration.
    return this.parent.return(Path.next(this.path), [], [], scanner);
};

function Goto(story, path, parent, ends) {
    this.type = 'goto';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
}

Goto.prototype.return = function _return(expression, scanner) {
    // istanbul ignore else
    if (expression[0] === 'get') {
        tieName(this.ends, expression[1]);
        return this.parent.return(Path.next(this.path), [], [], scanner);
    } else {
        this.story.error('Expected label after goto arrow, got expression ' + JSON.stringify(expression) + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

function Call(story, path, parent, ends) {
    this.type = 'call';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    Object.seal(this);
}

Call.prototype.return = function _return(expression, scanner) {
    // istanbul ignore else
    if (expression[0] === 'get') {
        var label = expression[1];
        var node = this.story.create(this.path, 'call', label);
        var branch = new Branch(node);
        tie(this.ends, this.path);
        return new Knot(this.story, Path.firstChild(this.path), new EndCall(this.story, this.path, node, this.parent, label), [branch], []);
    } else {
        this.story.error('Expected label after call arrow, got expression ' + JSON.stringify(expression) + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

function EndCall(story, path, node, parent, label) {
    this.story = story;
    this.path = path;
    this.node = node;
    this.parent = parent;
    this.label = label;
    Object.seal(this);
}

EndCall.prototype.return = function _return(path, ends, jumps, scanner) {
    tieName(ends, this.label);
    return new Expect('token', '}', this.story, Path.next(this.path), this.parent, [this.node], jumps);
};

function Block(story, path, parent, ends) {
    this.type = 'block';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
}

var comparators = {
    '>': true,
    '<': true,
    '>=': true,
    '<=': true,
    '==': true,
    '!=': true
};

var jumps = {
    '?': '!=', // to 0
    '!': '==' // to 0
};

var mutators = {
    '=': true,
    '+': true,
    '-': true,
    '*': true,
    '/': true,
};

var variables = {
    '$': 'walk',
    '@': 'loop',
    '#': 'hash'
};

var switches = {
    '%': 'loop',
    '~': 'rand'
};

Block.prototype.next = function next(type, space, text, scanner) {
    if (type === 'symbol' || type === 'alphanum' || type === 'token') {
        if (jumps[text]) {
            return expression(this.story, new Jump(this.story, this.path, this.parent, this.ends, jumps[text], ['val', 0]));
        } else if (comparators[text]) {
            return expression(this.story, new JumpCompare(this.story, this.path, this.parent, this.ends, text));
        } else if (mutators[text]) {
            return expression(this.story, new Set(this.story, this.path, this.parent, this.ends, text));
        } else if (variables[text]) {
            return expression(this.story, new ExpressionSwitch(this.story, this.path, this.parent, this.ends, variables[text]));
        } else if (text === ',') {
            return new Conjunction(this.story, this.path, this.parent, this.ends);
        } else if (switches[text]) {
            return new Switch(this.story, this.path, this.parent, this.ends)
                .start(null, null, null, switches[text])
                .case();
        } else if (text === '->') {
            return expression.variable(this.story, new Call(this.story, this.path, this.parent, this.ends));
        }
    }
    return new Switch(this.story, this.path, this.parent, this.ends)
        .start(null, Path.toName(this.path), 1, 'walk') // with variable and value, waiting for case to start
        .case() // first case
        .next(type, space, text, scanner);
};

function Conjunction(story, path, parent, ends) {
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.text = '';
    this.lift = '';
    this.drop = '';
    Object.seal(this);
}

Conjunction.prototype.next = function next(type, space, text, scanner) {
    if (type === 'symbol' || type === 'alphanum' || type === 'number') {
        return new ContinueConjunction(this.story, this.path, this.parent, this.ends, space, text);
    // istanbul ignore else
    } else if (type === 'token' && text === '}') {
        var delimit = this.story.create(this.path, 'delimit');
        tie(this.ends, this.path);
        return this.parent.return(Path.next(this.path), [delimit], [], scanner);
    } else {
        this.story.error('Expected conjunction text or delimiter in {,} block, got: ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

function ContinueConjunction(story, path, parent, ends, lift, text) {
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.lift = lift;
    this.text = text;
    Object.seal(this);
}

ContinueConjunction.prototype.next = function next(type, space, text, scanner) {
    // istanbul ignore if
    if (type === 'symbol' || type === 'number') {
        this.text += space + text;
        return this;
    // istanbul ignore else
    } else if (text === '|') {
        var start = this.story.create(this.path, 'startJoin');
        start.text = this.text;
        start.lift = this.lift;
        start.drop = space;
        // TODO thread text lift drop of conjunction
        tie(this.ends, this.path);
        return new Knot(this.story, Path.next(this.path), this, [start], []);
    } else {
        this.story.error('Expected conjunction text or pipe |, got ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

ContinueConjunction.prototype.return = function _return(path, ends, jumps, scanner) {
    var stop = this.story.create(path, 'stopJoin');
    tie(ends, path);
    return new Expect('token', '}', this.story, Path.next(path), this.parent, [stop], jumps);
};

function JumpCompare(story, path, parent, ends, condition) {
    this.type = 'jump';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.condition = condition;
    Object.seal(this);
}

JumpCompare.prototype.return = function _return(right) {
    return expression(this.story, new Jump(this.story, this.path, this.parent, this.ends, this.condition, right));
};

function Jump(story, path, parent, ends, condition, right) {
    this.type = 'jump';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.condition = condition;
    this.right = right;
    Object.seal(this);
}

Jump.prototype.return = function _return(left) {
    return new MaybeConditional(this.story, this.path, this.parent, this.ends, [this.condition, left, this.right]);
};

function MaybeConditional(story, path, parent, ends, condition) {
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.condition = condition;
    Object.seal(this);
}

MaybeConditional.prototype.next = function next(type, space, text, scanner) {
    if (text === '|') {
        return new Switch(this.story, this.path, this.parent, this.ends)
            .start(expression.invert(this.condition), null, 0, 'walk', 2)
            .case();
    // istanbul ignore else
    } else if (text === '}') {
        var node = this.story.create(this.path, 'jump', this.condition);
        var branch = new Branch(node);
        tie(this.ends, this.path);
        return new Knot(this.story, Path.next(this.path), new Rejoin(this.parent, node), [branch], []);
    } else {
        this.story.error('Expected | or } after condition, got ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

function Set(story, path, parent, ends, op) {
    this.type = 'set';
    this.op = op;
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
}

Set.prototype.return = function _return(expression) {
    return new MaybeSetVariable(this.story, this.path, this.parent, this.ends, this.op, expression);
    // return expression.variable(this.story, new ExpectSetVariable(this.story, this.path, this.parent, this.ends, this.op, source));
};

function MaybeSetVariable(story, path, parent, ends, op, expression) {
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.op = op;
    this.expression = expression;
}

MaybeSetVariable.prototype.next = function next(type, space, text, scanner) {
    if (type === 'token' && text === '}') {
        return setVariable(this.story, this.path, this.parent, this.ends, this.op, ['val', 1], this.expression, scanner)
            .next(type, space, text, scanner);
    }
    return expression(this.story, new ExpectSetVariable(this.story, this.path, this.parent, this.ends, this.op, this.expression))
        .next(type, space, text, scanner);
};

function ExpectSetVariable(story, path, parent, ends, op, source) {
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.op = op;
    this.source = source;
}

ExpectSetVariable.prototype.return = function _return(target, scanner) {
    return setVariable(this.story, this.path, this.parent, this.ends, this.op, this.source, target, scanner);
};

function setVariable(story, path, parent, ends, op, source, target, scanner) {
    if (target[0] === 'get') {
        var variable = target[1];
        var node = story.create(path, 'set');
        if (op === '=') {
            node.expression = source;
        } else {
            node.expression = [op, target, source];
        }
        node.variable = variable;
        tie(ends, path);
        return new Expect('token', '}', story, Path.next(path), parent, [node], []);
    // istanbul ignore else
    } else if (target[0] === 'var') {
        var node = story.create(path, 'mov');
        if (op === '=') {
            node.source = source;
        } else {
            node.source = [op, target, source];
        }
        node.target = target;
        tie(ends, path);
        return new Expect('token', '}', story, Path.next(path), parent, [node], []);
    } else {
        this.story.error('Expected a variable to set, got expression ' + JSON.stringify(source) + ' ' + op + ' ' + JSON.stringify(target) + ' at ' + scanner.position());
        return new Knot(story, path, parent, ends, []);
    }
}

function ExpressionSwitch(story, path, parent, ends, mode) {
    this.type = 'expression-switch';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.mode = mode;
}

ExpressionSwitch.prototype.return = function _return(expression) {
    return new Variable(this.story, this.path, this.parent, this.ends, this.mode, expression);
};

function Variable(story, path, parent, ends, mode, expression) {
    this.type = 'variable';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.mode = mode;
    this.expression = expression;
    Object.seal(this);
}

Variable.prototype.next = function next(type, space, text, scanner) {
    if (text === '|') {
        return new Switch(this.story, this.path, this.parent, this.ends)
            .start(this.expression, null, 0, this.mode)
            .case();
    // istanbul ignore else
    } else if (text === '}') {
        var node = this.story.create(this.path, 'print', this.expression);
        tie(this.ends, this.path);
        return new Knot(this.story, Path.next(this.path), this.parent, [node], []);
    } else {
        this.story.error('Expected | or } after expression in {$} block, got ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, []);
    }
};

function Switch(story, path, parent, ends) {
    this.type = 'switch';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.branches = [];
}

Switch.prototype.start = function start(expression, variable, value, mode, min) {
    value = value || 0;
    if (mode === 'loop' && !expression) {
        value = 1;
    }
    expression = expression || ['get', Path.toName(this.path)];
    var node = this.story.create(this.path, 'switch', expression);
    node.variable = variable;
    node.value = value;
    node.mode = mode;
    tie(this.ends, this.path);
    node.branches = this.branches;
    return new Case(this.story, Path.firstChild(this.path), this, [], this.branches, min || 0);
};

Switch.prototype.return = function _return(path, ends, jumps, scanner) {
    return new Expect('token', '}', this.story, Path.next(this.path), this.parent, ends, jumps);
};

function Case(story, path, parent, ends, branches, min) {
    this.type = 'case';
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.branches = branches;
    this.min = min;
    Object.seal(this);
}

Case.prototype.next = function next(type, space, text, scanner) {
    if (text === '|') {
        return this.case();
    } else {
        var path = this.path;
        while (this.branches.length < this.min) {
            var node = this.story.create(path, 'goto', null);
            this.ends.push(node);
            this.branches.push(Path.toName(path));
            path = Path.next(path);
        }
        return this.parent.return(path, this.ends, [], scanner)
            .next(type, space, text, scanner);
    }
};

Case.prototype.case = function _case() {
    var path = Path.zerothChild(this.path);
    var node = this.story.create(path, 'goto', null);
    this.branches.push(Path.toName(path));
    return new Knot(this.story, path, this, [node], []);
};

Case.prototype.return = function _return(path, ends, jumps, scanner) {
    return new Case(this.story, Path.next(this.path), this.parent, this.ends.concat(ends, jumps), this.branches, this.min);
};

function Expect(type, text, story, path, parent, ends, jumps) {
    this.type = 'expect';
    this.expect = type;
    this.text = text;
    this.story = story;
    this.path = path;
    this.parent = parent;
    this.ends = ends;
    this.jumps = jumps;
}

Expect.prototype.next = function next(type, space, text, scanner) {
    // istanbul ignore else
    if (type === this.expect && text === this.text) {
        return this.parent.return(this.path, this.ends, this.jumps, scanner);
    } else {
        this.story.error('Expected ' + this.expect + ' ' + this.text + ', got ' + type + '/' + text + ' at ' + scanner.position());
        return new Knot(this.story, this.path, this.parent, this.ends, this.jumps);
    }
};

function tie(ends, next) {
    var name = Path.toName(next);
    tieName(ends, name);
}

function tieName(ends, name) {
    for (var i = 0; i < ends.length; i++) {
        var end = ends[i];
        end.tie(name);
    }
}
