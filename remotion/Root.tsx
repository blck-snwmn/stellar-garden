import { Composition } from "remotion";
import StarFieldVideo from "./StarFieldVideo";

const FPS = 30;
const DURATION_SECONDS = 10;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="StarField"
      component={StarFieldVideo}
      durationInFrames={FPS * DURATION_SECONDS}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
