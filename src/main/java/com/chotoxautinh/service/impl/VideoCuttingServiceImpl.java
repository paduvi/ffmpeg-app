package com.chotoxautinh.service.impl;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import com.chotoxautinh.model.FrameDataset;
import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.util.ImageUtils;
import com.chotoxautinh.util.SimilarityUtils;
import com.chotoxautinh.util.VideoUtils;
import lombok.extern.slf4j.Slf4j;
import org.nd4j.linalg.api.ndarray.INDArray;
import org.nd4j.linalg.factory.Nd4j;
import org.opencv.core.Mat;
import org.opencv.imgcodecs.Imgcodecs;
import org.opencv.videoio.VideoCapture;
import org.opencv.videoio.Videoio;

import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;
import java.util.function.Supplier;

@Slf4j
public class VideoCuttingServiceImpl implements VideoCuttingService {

    private static final int BATCH_SIZE = 128;
    private static final int FRAME_WIDTH = 224;
    private static final int FRAME_HEIGHT = 224;
    private static final int FRAME_SKIP = 30; // sample each 30 frame

    // Private constructor to prevent direct instantiation
    private VideoCuttingServiceImpl() {
    }

    private static final class VideoCuttingServiceHolder {
        private static final VideoCuttingServiceImpl INSTANCE = new VideoCuttingServiceImpl();
    }

    public static VideoCuttingServiceImpl getInstance() {
        return VideoCuttingServiceImpl.VideoCuttingServiceHolder.INSTANCE;
    }

    @Override
    public Double pickBestMoment(String inputVideoPath, String sampleImagePath, Supplier<Boolean> isCancelled, Consumer<Double> consumer) throws Exception {
        try (
                InputStream modelInputStream = getClass().getResourceAsStream("/model/resnet18_identity.onnx");
                OrtEnvironment env = OrtEnvironment.getEnvironment();
                OrtSession session = env.createSession(Objects.requireNonNull(modelInputStream).readAllBytes(), new OrtSession.SessionOptions())
        ) {
            final BufferedImage templateImage = ImageUtils.matToBufferedImage(Imgcodecs.imread(sampleImagePath));
            final float[] templateInput = new FrameDataset(List.of(templateImage), FRAME_WIDTH, FRAME_HEIGHT).iterator().next();  // [3×224×224]

            // Predict
            final float[] templateVec;
            try (OnnxTensor templateTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(templateInput), new long[]{1, 3, FRAME_WIDTH, FRAME_HEIGHT});
                 OrtSession.Result result = session.run(Collections.singletonMap("modelInput", templateTensor))
            ) {
                templateVec = ((float[][]) result.get(0).getValue())[0];
            }

            VideoCapture cap = new VideoCapture(inputVideoPath);
            try {
                if (!cap.isOpened()) {
                    throw new Exception("Cannot open video " + inputVideoPath + " !");
                }

                long videoDuration = VideoUtils.getVideoDuration(new File(inputVideoPath));
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
                    if (isCancelled.get()) {
                        return null;
                    }
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
                        double updateProgress = timestamp / (1000.0 * videoDuration);
                        consumer.accept(updateProgress);

                        batchProcessing(batch, flatBuffer, env, session, templateVec, similarityMatrix);

                        // Try to find the chosen time based on processed frames. Skip if the number of processed frames is too large.
                        if (similarityMatrix.size() > 20_000) {
                            continue;
                        }
                        Double chosenTime = getChosenTime(similarityMatrix, timestamps);
                        if (chosenTime != null) {
                            return chosenTime;
                        }
                    }
                }
                // No more video frame
                if (!batch.isEmpty()) {
                    consumer.accept(1.);

                    flatBuffer = ByteBuffer.allocateDirect(batch.size() * 3 * FRAME_WIDTH * FRAME_HEIGHT * Float.BYTES)
                            .order(ByteOrder.nativeOrder())
                            .asFloatBuffer();
                    batchProcessing(batch, flatBuffer, env, session, templateVec, similarityMatrix);
                }

                return getChosenTime(similarityMatrix, timestamps);
            } finally {
                cap.release();
            }
        }
    }

    private Double getChosenTime(List<Float> similarityMatrix, List<Long> timestamps) {
        try (INDArray similarities = Nd4j.create(similarityMatrix.size())) {
            for (int i = 0; i < similarityMatrix.size(); i++) {
                similarities.putScalar(i, similarityMatrix.get(i));
            }

            Integer bestFrameIndex = SimilarityUtils.findSampleEndMoment(
                    similarities,
                    timestamps.stream().mapToLong(Long::valueOf).toArray(),
                    0.9,
                    2);
            if (bestFrameIndex == null) {
                return null;
            }
            if (bestFrameIndex >= timestamps.size() || bestFrameIndex < 0) {
                return null;
            }

            return Double.valueOf(timestamps.get(bestFrameIndex));
        }
    }


    private void batchProcessing(
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

        float[][] frameVecs;
        try (
                OnnxTensor batchTensor = OnnxTensor.createTensor(env, flatBuffer.rewind(), new long[]{B, 3, FRAME_WIDTH, FRAME_HEIGHT});
                OrtSession.Result batchResult = session.run(Collections.singletonMap("modelInput", batchTensor))
        ) {
            frameVecs = (float[][]) batchResult.get(0).getValue();
            flatBuffer.clear();
        }
        for (float cosineScore : SimilarityUtils.cosineSimilarityBatch(templateVec, frameVecs)) {
            similarityMatrix.add(cosineScore);
        }
    }

    @Override
    public void cutVideo(String inputPath, String outputPath, double startTime) throws IOException, InterruptedException {
        ProcessBuilder builder = new ProcessBuilder(VideoUtils.getBinaryPath(),
                "-i", inputPath,
                "-c", "copy",
                "-threads", "0",
                "-ss", String.valueOf(Math.floor(startTime)),
                "-y", outputPath);
        builder.redirectErrorStream(true);
        builder.inheritIO();
        Process process = builder.start();
        process.waitFor();
    }
}