package com.chotoxautinh.controller.compression;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.controller.AbstractProgressController;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.service.VideoCompressionService;
import com.chotoxautinh.service.impl.VideoCompressionServiceImpl;
import com.chotoxautinh.util.AppUtils;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.ProgressBar;
import lombok.extern.slf4j.Slf4j;
import org.nd4j.common.primitives.AtomicDouble;

import java.io.File;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.prefs.Preferences;

@Slf4j
public class CompressionProgressController extends AbstractProgressController {
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    private static final Object LOCK = new Object();

    private double progressValue;
    private CountDownLatch latch;

    private final VideoCompressionService videoCompressionService = VideoCompressionServiceImpl.getInstance();

    @FXML
    private ProgressBar progressBar;

    private String getExtension() {
        return prefs.get(Constants.VIDEO_EXTENSION_KEY, Constants.DEFAULT_VIDEO_EXTENSION_VALUE);
    }

    public void setVideos(List<Video> videos) {
        progressBar.setProgress(0);
        progressValue = 0;
        latch = new CountDownLatch(videos.size());

        new Thread(() -> {
            try {
                latch.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (!isRunning())
                return;
            progressBar.setProgress(1);
            Platform.runLater(this::done);
        }).start();

        setRunning(true);
        updateLabel("0%");

        String extension = getExtension();
        for (Video video : videos) {
            Task<Double> task = getTask(videos, video, extension);

            task.setOnFailed(event -> {
                log.error("Error running ffmpeg: ", event.getSource().getException());

                setRunning(false);
                handleCancel();

                String message = "File Name: " + video.getPath().substring(video.getPath().lastIndexOf("/") + 1);
                AppUtils.alertError("Ooops, there was an error!", message);
            });
            task.valueProperty().addListener((observable, oldValue, newValue) -> {
                if (!isRunning())
                    return;
                progressBar.setProgress(newValue);
                if (latch.getCount() > 0) {
                    updateLabel(Math.round(newValue * 100) + "%");
                }
            });

            addTask(task);
        }
    }

    private Task<Double> getTask(List<Video> videos, Video video, String extension) {
        String inputPath = video.getPath();
        String outputPath = getContainFolder() + File.separator + video.getName() + (extension.equals(Constants.DEFAULT_VIDEO_EXTENSION_VALUE) ? video.getExtension() : "." + extension);

        return new Task<>() {
            @Override
            protected Double call() throws Exception {
                double totalProgress = 1.0 / videos.size();
                AtomicDouble currentProgress = new AtomicDouble(0);

                try {
                    if (isCancelled())
                        return null;

                    videoCompressionService.compressVideo(
                            inputPath, outputPath,
                            this::isCancelled,
                            progress -> {
                                double updateProgress = progress * totalProgress;

                                synchronized (LOCK) {
                                    progressValue += (updateProgress - currentProgress.get());
                                    updateValue(progressValue);
                                    currentProgress.set(updateProgress);
                                }
                            }
                    );
                } finally {
                    latch.countDown();
                }

                synchronized (LOCK) {
                    progressValue += (totalProgress - currentProgress.get());
                    updateValue(progressValue);
                    return progressValue;
                }
            }
        };
    }

}
