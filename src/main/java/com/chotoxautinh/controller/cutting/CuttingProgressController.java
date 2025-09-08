package com.chotoxautinh.controller.cutting;

import com.chotoxautinh.controller.AbstractProgressController;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.service.impl.VideoCuttingServiceImpl;
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

@Slf4j
public class CuttingProgressController extends AbstractProgressController {
    private static final Object LOCK = new Object();

    private double progressValue;
    private CountDownLatch latch;

    private final VideoCuttingService videoCuttingService = VideoCuttingServiceImpl.getInstance();

    @FXML
    private ProgressBar progressBar;

    public void setVideos(List<Video> videos, String sampleImagePath) {
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

        for (Video video : videos) {
            Task<Double> task = new Task<>() {
                @Override
                protected Double call() throws Exception {
                    double totalProgress = 1.0 / videos.size();
                    AtomicDouble currentProgress = new AtomicDouble(0);

                    try {
                        if (isCancelled())
                            return null;
                        Double chosenTime = videoCuttingService.pickBestMoment(video.getPath(), sampleImagePath, this::isCancelled, progress -> {
                            double updateProgress = 0.9 * totalProgress * progress;
                            synchronized (LOCK) {
                                progressValue += (updateProgress - currentProgress.get());
                                updateValue(progressValue);
                                currentProgress.set(updateProgress);
                            }
                        });

                        double updateProgress = 0.95 * totalProgress;
                        synchronized (LOCK) {
                            progressValue += (updateProgress - currentProgress.get());
                            updateValue(progressValue);
                            currentProgress.set(updateProgress);
                        }
                        if (chosenTime == null) {
                            throw new Exception("Cannot find sample end moment, please check the video and template image!");
                        }
                        videoCuttingService.cutVideo(video.getPath(), getContainFolder() + File.separator + video.getName() + video.getExtension(), chosenTime / 1000);
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

            task.setOnFailed(event -> {
                log.error("Error cutting video: ", event.getSource().getException());

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
}
