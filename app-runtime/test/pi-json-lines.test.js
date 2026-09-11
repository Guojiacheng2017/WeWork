import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {readPiJsonLines} from '../src/pi-json-lines.js';
test('Pi framing preserves split UTF-8, CRLF and final lines',async()=>{
 const input=new PassThrough(), values=[], errors=[];
 const close=readPiJsonLines(input,value=>values.push(value),error=>errors.push(error));
 const bytes=Buffer.from('{"text":"中文"}\r\n\n{"last":true}');
 for(const byte of bytes) input.write(Buffer.from([byte]));
 input.end(); await new Promise(resolve=>setImmediate(resolve)); close();
 assert.deepEqual(values,[{text:'中文'},{last:true}]);assert.deepEqual(errors,[]);
});
test('consumer failures are not classified as parse failures',()=>{
 const input=new PassThrough(),errors=[];
 const close=readPiJsonLines(input,()=>{throw Error('consumer failed')},e=>errors.push(e.message));
 input.write('{}\ninvalid\n');close();
 assert.equal(errors[0],'consumer failed');assert.match(errors[1],/Invalid Pi RPC output/);
});
