import assert from 'node:assert/strict';
import test from 'node:test';
import {Session} from '../.m0-build/m0/Session.js';

test('controller caps time debt, pauses, clears input, and resumes without catch-up', () => {
 const s=new Session();
 try {
  s.x=1; s.advance(5); assert.equal(s.world.tick,3);
  s.pause(); assert.equal(s.x,0); s.advance(5); assert.equal(s.world.tick,3);
  s.resume(); s.advance(1/30); assert.equal(s.world.tick,4);
  s.restart(); assert.equal(s.world.tick,0); assert.equal(s.paused,true);
 } finally{s.dispose();}
});
