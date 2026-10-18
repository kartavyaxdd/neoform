import {expect,it} from 'vitest';
import {GEMINI_MODEL,geminiProofSchema} from '../src/aiProof';
it('selects the live-qualified Flash-Lite model and accepts its strict no-tool proof',()=>{
 const syntheticProof={provider:'gemini',model:'gemini-3.5-flash-lite',inputTokens:1,outputTokens:1,toolCalls:0,toolsProvided:0,agentLoop:false};
 expect(GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
 expect(geminiProofSchema.safeParse(syntheticProof).success).toBe(true);
 expect(geminiProofSchema.safeParse({...syntheticProof,model:'gemini-3.8-flash'}).success).toBe(false);
});
