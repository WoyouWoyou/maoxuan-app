"""Reproduce the original Long March score (Python standard library + ffmpeg)."""
import math,wave,struct,subprocess,tempfile
from pathlib import Path
rate=22050; duration=64
samples=[0.0]*(rate*duration)
# Original pentatonic 8-bar composition. All audio is synthesized locally; no samples.
notes=[(0,60),(2,64),(4,67),(6,69),(8,67),(10,64),(12,62),(14,55),(16,57),(18,60),(20,64),(22,67),(24,69),(26,67),(28,64),(30,62),(32,60),(34,62),(36,64),(38,67),(40,64),(42,62),(44,57),(46,55),(48,57),(50,60),(52,62),(54,64),(56,62),(58,60)]
def tone(start,midi,length,amp):
 freq=440*2**((midi-69)/12)
 for j in range(int(length*rate)):
  i=int(start*rate)+j
  if i>=len(samples): break
  t=j/rate
  env=(1-math.exp(-t*35))*math.exp(-t/1.9)*min(1,(length-t)/.4)
  v=sum(a*math.sin(2*math.pi*freq*h*t)*math.exp(-t*(h-1)*.3) for h,a in [(1,1),(2,.27),(3,.08)])
  samples[i]+=amp*env*v
for start,midi in notes: tone(start,midi,5,.15)
for start,chord in [(0,[48,55,60]),(8,[43,50,55]),(16,[45,52,57]),(24,[48,55,60]),(32,[48,55,60]),(40,[43,50,55]),(48,[45,52,57]),(56,[48,55,60])]:
 for k,midi in enumerate(chord): tone(start+k*.3,midi,7,.07)
# Quiet stereo echo, with fades to make looping gentle.
with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp:
 wav_path = Path(temp.name)
with wave.open(str(wav_path),'wb') as out:
 out.setparams((2,2,rate,0,'NONE','not compressed'))
 frames=bytearray()
 for i,v in enumerate(samples):
  fade=min(1,i/rate/2,(duration-i/rate)/4)
  left=(v+(samples[i-int(.39*rate)]*.18 if i>int(.39*rate) else 0))*fade
  right=(v+(samples[i-int(.53*rate)]*.2 if i>int(.53*rate) else 0))*fade
  frames.extend(struct.pack('<hh',int(max(-1,min(1,left))*32767),int(max(-1,min(1,right))*32767)))
 out.writeframes(frames)

try:
 destination=Path(__file__).resolve().parents[1]/'src/renderer/src/features/long-march/assets/shanhe.mp3'
 subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav_path),'-codec:a','libmp3lame','-q:a','4',str(destination)],check=True)
finally:
 wav_path.unlink(missing_ok=True)
