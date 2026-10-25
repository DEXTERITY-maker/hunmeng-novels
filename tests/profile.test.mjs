import test from 'node:test';
import assert from 'node:assert/strict';
import { readProfile, validateNickname } from '../src/lib/profile.ts';
test('никнейм: кириллица, латиница, нормализация и ограничения',()=>{
 for (const valid of ['Читатель','Моряк_21','Reader-1','Тихий читатель','abc','a'.repeat(24)]) assert.equal(validateNickname(' '+valid+' '),valid);
 for (const bad of ['','аб','a'.repeat(25),'<script>','foo@example.test','_reader','Читатель\nМоряк','Читатель🦊']) assert.equal(validateNickname(bad),null);
 assert.equal(validateNickname('И\u0306ван'),'Йван');
});
test('метаданные профиля допускают только поля представления и известные цвета',()=>{
 assert.deepEqual(readProfile({nickname:'Моряк',bio:'Море',avatar_color:'navy',role:'admin',library:{},progress:{}}),{nickname:'Моряк',bio:'Море',avatar_color:'navy'});
 assert.deepEqual(readProfile(null),{nickname:'Читатель',bio:'',avatar_color:'sage'});
 assert.deepEqual(readProfile({nickname:'<script>',bio:{},avatar_color:'url(evil)'}),readProfile(null));
 assert.equal(readProfile({bio:'x'.repeat(200)}).bio.length,160);
});
