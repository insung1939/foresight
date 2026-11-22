// 큰 '내 방' 화면에서만 받는 후처리(앰비언트 오클루전·블룸·ACES 톤매핑·SMAA). 약 170KB라 따로 나눴다.
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

export default function Post() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={0.55} distanceFalloff={0.6} intensity={2.6} quality="medium" halfRes />
      <Bloom mipmapBlur luminanceThreshold={1} intensity={0.55} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
