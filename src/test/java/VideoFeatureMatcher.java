import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import com.chotoxautinh.model.FrameDataset;
import com.chotoxautinh.util.ImageUtils;
import com.chotoxautinh.util.SimilarityUtils;
import com.chotoxautinh.util.VideoUtils;
import lombok.extern.slf4j.Slf4j;
import nu.pattern.OpenCV;
import org.nd4j.linalg.api.ndarray.INDArray;
import org.nd4j.linalg.factory.Nd4j;
import org.opencv.core.Mat;
import org.opencv.imgcodecs.Imgcodecs;
import org.opencv.videoio.VideoCapture;
import org.opencv.videoio.Videoio;

import java.awt.image.BufferedImage;
import java.io.File;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Slf4j
public class VideoFeatureMatcher {

    private static final int BATCH_SIZE = 256;
    private static final int FRAME_WIDTH = 224;
    private static final int FRAME_HEIGHT = 224;
    private static final int FRAME_SKIP = 30; // sample each 30 frame

    public static void main(String[] args) throws Exception {
        OpenCV.loadLocally();

        String videoPath = "src/test/resources/sample.mp4";
        String templatePath = "src/main/resources/img/sample.png";
        String modelPath = "src/main/resources/model/resnet18_identity.onnx";
        double chosenTime;

        try (OrtEnvironment env = OrtEnvironment.getEnvironment();
             OrtSession session = env.createSession(modelPath, new OrtSession.SessionOptions())
        ) {
            Long startTime = System.currentTimeMillis();
            log.info("Loading template image: {}", templatePath);
            BufferedImage templateImage = ImageUtils.matToBufferedImage(Imgcodecs.imread(templatePath));
            float[] templateInput = new FrameDataset(List.of(templateImage), FRAME_WIDTH, FRAME_HEIGHT).iterator().next();  // [3×224×224]
            log.info("Template image loaded, shape: {}", templateInput.length);

            // Predict
            float[] templateVec;
            try (OnnxTensor templateTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(templateInput), new long[]{1, 3, FRAME_WIDTH, FRAME_HEIGHT});
                 OrtSession.Result result = session.run(Collections.singletonMap("modelInput", templateTensor))
            ) {
                templateVec = ((float[][]) result.get(0).getValue())[0];
            }
            log.info("Template image vectorized, shape: {}", templateVec.length);

            // Extract video via OpenCV
            VideoCapture cap = new VideoCapture(videoPath);
            if (!cap.isOpened()) {
                log.error("Cannot open video!");
                return;
            }

            long videoDuration = VideoUtils.getVideoDuration(new File(videoPath));
            List<Long> timestamps = new ArrayList<>();
            int frameCount = 0;
            double fps = cap.get(Videoio.CAP_PROP_FPS);
            double frameDurationMs = 1000.0 / fps;
            List<Float> similarityMatrix = new ArrayList<>();
            FloatBuffer flatBuffer = ByteBuffer.allocateDirect(BATCH_SIZE * 3 * FRAME_WIDTH * FRAME_HEIGHT * Float.BYTES)
                    .order(ByteOrder.nativeOrder())
                    .asFloatBuffer();

            List<BufferedImage> batch = new ArrayList<>();
            while (cap.grab()) {
                frameCount++;

                // Only sample each FRAME_SKIP frame
                if (frameCount % FRAME_SKIP != 0) continue;

                Mat frame = new Mat();
                cap.retrieve(frame);
                batch.add(ImageUtils.matToBufferedImage(frame));
                long timestamp = (long) (frameCount * frameDurationMs);
                timestamps.add(timestamp);

                // Exceed BATCH_SIZE
                if (batch.size() == BATCH_SIZE) {
                    log.info("Processing batch, current timestamp: {}/{}", timestamp / 1000, videoDuration);
                    batchProcessing(batch, flatBuffer, env, session, templateVec, similarityMatrix);
                }
            }
            // No more video frame
            if (!batch.isEmpty()) {
                log.info("Processing last batch");
                flatBuffer = ByteBuffer.allocateDirect(batch.size() * 3 * FRAME_WIDTH * FRAME_HEIGHT * Float.BYTES)
                        .order(ByteOrder.nativeOrder())
                        .asFloatBuffer();
                batchProcessing(batch, flatBuffer, env, session, templateVec, similarityMatrix);
            }

            try (INDArray similarities = Nd4j.create(similarityMatrix.size())) {
                for (int i = 0; i < similarityMatrix.size(); i++) {
                    similarities.putScalar(i, similarityMatrix.get(i));
                }

                Long endTime = System.currentTimeMillis();
                log.info("Video loaded in {} s", (endTime - startTime) / 1000.0);

                Integer bestFrameIndex = SimilarityUtils.findSampleEndMoment(
                        similarities,
                        timestamps.stream().mapToLong(Long::valueOf).toArray(),
                        0.9,
                        2);
                if (bestFrameIndex == null) {
                    log.error("Cannot find sample end moment, please check the video and template image!");
                    return;
                }
                chosenTime = timestamps.get(bestFrameIndex);
                log.info("Sample end moment found: {}", chosenTime / 1000.0);
            } finally {
                cap.release();
            }
        }

        VideoCapture cap = new VideoCapture(videoPath);
        cap.set(Videoio.CAP_PROP_POS_MSEC, chosenTime);

        try {
            Mat bestFrame = new Mat();
            if (!cap.read(bestFrame)) {
                log.info("Cannot extract frame at {}s", chosenTime / 1000.0);
                return;
            }
            Imgcodecs.imwrite("src/test/resources/best_frame.jpg", bestFrame); // Save frame
            log.info("Saved to best_frame.jpg");
        } finally {
            cap.release();
        }
    }

    private static void batchProcessing(
            List<BufferedImage> batch,
            FloatBuffer flatBuffer,
            OrtEnvironment env,
            OrtSession session,
            float[] templateVec,
            List<Float> similarityMatrix
    ) throws Exception {
        // Tạo batch input [B, 3, 224, 224]
        int B = batch.size();
        for (float[] frame : new FrameDataset(batch, FRAME_WIDTH, FRAME_HEIGHT)) {
            flatBuffer.put(frame);
        }
        batch.clear();
        log.info("Batch flattened, batch size: {}", B);

        float[][] frameVecs;
        try (
                OnnxTensor batchTensor = OnnxTensor.createTensor(env, flatBuffer.rewind(), new long[]{B, 3, FRAME_WIDTH, FRAME_HEIGHT});
                OrtSession.Result batchResult = session.run(Collections.singletonMap("modelInput", batchTensor))
        ) {
            frameVecs = (float[][]) batchResult.get(0).getValue();
            flatBuffer.clear();
        }
        log.info("Batch vectorized, shape: {}", frameVecs.length);
        for (float cosineScore : SimilarityUtils.cosineSimilarityBatch(templateVec, frameVecs)) {
            similarityMatrix.add(cosineScore);
        }
        log.info("Similarity matrix calculated, shape: {}", similarityMatrix.size());
    }
}
