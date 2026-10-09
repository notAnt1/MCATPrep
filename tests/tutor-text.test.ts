import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tutorText} from '../src/lib/tutor-text';
test('tutor formatting removes decoration while preserving equations and scientific notation',()=>{
 assert.equal(tutorText('### Key idea\n\n**Sound travels twice.**\n\n* Outward\n* Return'), 'Key idea\n\nSound travels twice.\n• Outward\n• Return');
 assert.equal(tutorText('Use *half* the time and `d = ct / 2`.'),'Use half the time and d = ct / 2.');
 assert.equal(tutorText('2 * 3 * 4 = 24; K_d = 10^-6; A* is excited.'),'2 * 3 * 4 = 24; K_d = 10^-6; A* is excited.');
});
