package com.chotoxautinh.controller.cutting;

import com.chotoxautinh.controller.AbstractProgressController;
import com.chotoxautinh.model.Video;
import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.service.impl.VideoCuttingServiceImpl;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.ProgressBar;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Semaphore;

@Slf4j
public class CuttingProgressController extends AbstractProgressController {
    private static final Object LOCK = new Object();

    private double progressValue;
    private CountDownLatch latch;

    private final VideoCuttingService videoCuttingService = VideoCuttingServiceImpl.getInstance();

    @FXML
    private ProgressBar progressBar;

    public void setVideos(List<Video> videos, String sampleImagePath) {
        progressBar.setProgress(ProgressBar.INDETERMINATE_PROGRESS);
//        progressBar.setProgress(0);
        progressValue = 0;
        latch = new CountDownLatch(videos.size());

        setRunning(true);
//        updateLabel("0%");

        final Semaphore semaphore = new Semaphore(1);
        for (Video video : videos) {
            Task<Double> task = new Task<>() {
                @Override
                protected Double call() throws Exception {
                    double totalProgress = 1.0 / videos.size();
                    if (isCancelled())
                        return null;

                    try {
                        float chosenTime;
                        semaphore.acquire();
                        try {
                            chosenTime = videoCuttingService.queryChosenTime(video.getPath(), sampleImagePath);
                        } finally {
                            semaphore.release();
                        }
                        synchronized (LOCK) {
                            progressValue += (totalProgress / 10);
                            updateValue(progressValue);
                        }

                        videoCuttingService.cutVideo(video.getPath(), getContainFolder() + File.separator + video.getName() + ".mp4", chosenTime);
                        synchronized (LOCK) {
                            progressValue += (totalProgress * 9 / 10);
                            updateValue(progressValue);
                        }
                        return progressValue;
                    } finally {
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
//                progressBar.setProgress(newValue);
                if (latch.getCount() == 0) {
                    progressBar.setProgress(1);
                    done();
                } else {
                    updateLabel(Math.round(newValue * 100) + "%");
                }
            });

            addTask(task);
        }
    }

}
