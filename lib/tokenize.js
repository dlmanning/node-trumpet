var sax = require('sax');
var through = require('through');
var buffers = require('buffers');

var EVENTS = [
    'opentag', 'attribute', 'opencdata', 'closecdata',
    'closetag', 'script', 'comment', 'text'
];

module.exports = function (opts) {
    var parser = sax.createStream(false);
    var bufs = buffers();
    var tokenize = through(
        function (buf) {
            if (typeof buf === 'string') buf = Buffer(buf);
            bufs.push(buf);
            return parser.write(buf);
        },
        function () { parser.end() }
    );
    var position = 0;
    var attrs = [];
    
    EVENTS.forEach(function (evname) {
        parser['on' + evname] = function (arg) { makeFn(evname, arg) };
    });
    
    parser.on('end', function () {
        tokenize.queue(null);
    });
    
    return tokenize;
    
    function makeFn (evname, arg) {
        if (evname === 'attribute') {
            var pos = parser._parser.position
                - parser._parser.startTagPosition + 1
            ;
            return attrs.push([ arg, pos ]);
        }
        
        var len;
        if (evname === 'text') {
            len = arg.length;
        }
        else {
            len = parser._parser.position - position;
        }
        
        var byteLen = 0;
        for (var i = 0; i < len; i++) {
            var b = bufs.get(byteLen);
            if (b >= 192) {
                if (b >= 252) byteLen += 6;
                else if (b >= 248) byteLen += 5;
                else if (b >= 240) byteLen += 4;
                else if (b >= 224) byteLen += 3;
                else byteLen += 2;
            }
            else byteLen ++;
        }
        
        var buf = bufs.slice(0, byteLen);
        bufs.splice(0, byteLen);
        
        if (evname === 'opentag') {
            var str = buf.toString('utf8');
            var m = /<[^\s>]+\s*/.exec(str);
            
            tokenize.queue([ 'tag-begin', Buffer(m[0]), arg ]);
            var offset = m[0].length;
            
            attrs.forEach(function (attr) {
                var attrIndex = attr[1];
                
                var s = str.slice(offset, attrIndex);
                var wm = /^\s+/.exec(s);
                
                if (wm) {
                    tokenize.queue([ 'tag-space', Buffer(wm[0]) ]);
                    var abuf = Buffer(s.slice(wm[0].length));
                    tokenize.queue([ 'attribute', abuf, attr[0] ]);
                }
                else {
                    tokenize.queue([ 'attribute', Buffer(s), attr[0] ]);
                }
                offset = attrIndex;
            });
            
            tokenize.queue([ 'tag-end', Buffer(str.slice(offset)) ]);
            attrs = [];
        }
        else tokenize.queue([ evname, buf, arg ]);
        
        position += len;
    }
};
