package com.chotoxautinh.controller.cutting;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import com.chotoxautinh.controller.AbstractProgressController;
import com.chotoxautinh.model.FrameDataset;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.service.impl.VideoCuttingServiceImpl;
import com.chotoxautinh.util.ImageUtils;
import com.chotoxautinh.util.SimilarityUtils;
import com.chotoxautinh.util.VideoUtils;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.ProgressBar;
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
import java.util.concurrent.CountDownLatch;

@Slf4j
public class CuttingProgressController extends AbstractProgressController {
    private static final Object LOCK = new Object();

    private double progressValue;
    private CountDownLatch latch;
    private OrtEnvironment env;
    private OrtSession session;

    private final VideoCuttingService videoCuttingService = VideoCuttingServiceImpl.getInstance();

    private static final int BATCH_SIZE = 128;
    private static final int FRAME_WIDTH = 224;
    private static final int FRAME_HEIGHT = 224;
    private static final int FRAME_SKIP = 30; // sample each 30 frame

    @FXML
    private ProgressBar progressBar;

    public void setVideos(List<Video> videos, String sampleImagePath) throws IOException, OrtException {
        try (InputStream modelInputStream = getClass().getResourceAsStream("/model/resnet18_identity.onnx")) {
            progressBar.setProgress(0);
            progressValue = 0;
            latch = new CountDownLatch(videos.size());

            setRunning(true);
            updateLabel("0%");

            env = OrtEnvironment.getEnvironment();
            session = env.createSession(Objects.requireNonNull(modelInputStream).readAllBytes(), new OrtSession.SessionOptions());

            final BufferedImage templateImage = ImageUtils.matToBufferedImage(Imgcodecs.imread(sampleImagePath));
            final float[] templateInput = new FrameDataset(List.of(templateImage), FRAME_WIDTH, FRAME_HEIGHT).iterator().next();  // [3×224×224]

            // Predict
            final float[] templateVec;
            try (OnnxTensor templateTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(templateInput), new long[]{1, 3, FRAME_WIDTH, FRAME_HEIGHT});
                 OrtSession.Result result = session.run(Collections.singletonMap("modelInput", templateTensor))
            ) {
                templateVec = ((float[][]) result.get(0).getValue())[0];
            }

            for (Video video : videos) {
                Task<Double> task = new Task<>() {
                    @Override
                    protected Double call() throws Exception {
                        double totalProgress = 1.0 / videos.size();
                        if (isCancelled())
                            return null;
                        double currentProgress = 0;

                        VideoCapture cap = new VideoCapture(video.getPath());
                        try {
                            if (!cap.isOpened()) {
                                throw new Exception("Cannot open video " + video.getPath() + " !");
                            }

                            long videoDuration = VideoUtils.getVideoDuration(new File(video.getPath()));
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
                                if (isCancelled()) {
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
                                    double updateProgress = 0.9 * totalProgress * timestamp / (1000.0 * videoDuration);
                                    synchronized (LOCK) {
                                        progressValue += (updateProgress - currentProgress);
                                        updateValue(progressValue);
                                        currentProgress = updateProgress;
                                    }

                                    batchProcessing(batch, flatBuffer, env, session, templateVec, similarityMatrix);
                                }
                            }
                            // No more video frame
                            if (!batch.isEmpty()) {
                                double updateProgress = 0.9 * totalProgress;
                                synchronized (LOCK) {
                                    progressValue += (updateProgress - currentProgress);
                                    updateValue(progressValue);
                                    currentProgress = updateProgress;
                                }

                                flatBuffer = ByteBuffer.allocateDirect(batch.size() * 3 * FRAME_WIDTH * FRAME_HEIGHT * Float.BYTES)
                                        .order(ByteOrder.nativeOrder())
                                        .asFloatBuffer();
                                batchProcessing(batch, flatBuffer, env, session, templateVec, similarityMatrix);
                            }

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
                                    throw new Exception("Cannot find sample end moment, please check the video and template image!");
                                }

                                double updateProgress = 0.95 * totalProgress;
                                synchronized (LOCK) {
                                    progressValue += (updateProgress - currentProgress);
                                    updateValue(progressValue);
                                    currentProgress = updateProgress;
                                }

                                double chosenTime = timestamps.get(bestFrameIndex);
                                videoCuttingService.cutVideo(video.getPath(), getContainFolder() + File.separator + video.getName() + ".mp4", chosenTime / 1000);
                            }
                            synchronized (LOCK) {
                                progressValue += (totalProgress - currentProgress);
                                return progressValue;
                            }
                        } finally {
                            cap.release();
                            latch.countDown();
                        }
                    }
                };

                task.setOnFailed(event -> {
                    log.error("Error cutting video: ", event.getSource().getException());

                    setRunning(false);
                    handleCancel();

                    Alert alert = new Alert(AlertType.ERROR);
                    alert.setTitle("Error");
                    alert.setHeaderText("Ooops, there was an error!");
                    String message = "File Name: " + video.getPath().substring(video.getPath().lastIndexOf("/") + 1);
                    alert.setContentText(message + "\n" + event.getSource().getException().getMessage());

                    alert.showAndWait();
                });
                task.valueProperty().addListener((observable, oldValue, newValue) -> {
                    progressBar.setProgress(newValue);
                    if (latch.getCount() == 0) {
                        done();
                    } else {
                        updateLabel(Math.round(newValue * 100) + "%");
                    }
                });

                addTask(task);
            }
        }
    }

    @Override
    protected void handleCancel() {
        super.handleCancel();
        try {
            session.close();
        } catch (OrtException ignored) {
        }
        env.close();
    }

    @Override
    protected void done() {
        super.done();
        try {
            session.close();
        } catch (OrtException ignored) {
        }
        env.close();
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
}
