package com.chotoxautinh.controller.compression;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.controller.AbstractProgressController;
import com.chotoxautinh.model.AudioCodec;
import com.chotoxautinh.model.Constants;
import com.chotoxautinh.model.Preset;
import com.chotoxautinh.model.Video;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.ProgressBar;
import org.bytedeco.javacpp.Loader;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.prefs.Preferences;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class CompressionProgressController extends AbstractProgressController {
    private static final Logger LOGGER = LoggerFactory.getLogger(CompressionProgressController.class);
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    private static final Object LOCK = new Object();

    private double progressValue;
    private CountDownLatch latch;

    @FXML
    private ProgressBar progressBar;

    private String getBinaryPath() {
        if (prefs.getBoolean(Constants.USE_DEFAULT_FFMPEG_KEY, true))
            return Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);
        return prefs.get(Constants.FFMPEG_LOCATION_KEY, Loader.load(org.bytedeco.ffmpeg.ffmpeg.class));
    }

    private String getAudioCodec() {
        return AudioCodec.getValue(prefs.get(Constants.AUDIO_CODEC_KEY, Constants.DEFAULT_AUDIO_CODEC_VALUE.getLabel()));
    }

    private String getPreset() {
        return Preset.getValue(prefs.get(Constants.PRESET_KEY, Constants.DEFAULT_PRESET_VALUE.getLabel()));
    }

    private int getCrf() {
        return prefs.getInt(Constants.CRF_KEY, Constants.DEFAULT_CRF_VALUE);
    }

    public void setVideos(List<Video> videos) {
        // ffmpeg -i {input} -c:v h264 -c:a aac -preset medium -crf 23 output.mp4
        progressBar.setProgress(0);
        progressValue = 0;
        latch = new CountDownLatch(videos.size());

        setRunning(true);
        updateTimeLabel("0%");
        for (Video video : videos) {
            ProcessBuilder builder = new ProcessBuilder(getBinaryPath(), "-i", video.getPath(), "-c:v", "h264",
                    "-c:a", getAudioCodec(), "-preset", getPreset(), "-crf", String.valueOf(getCrf()), getContainFolder() + File.separator + video.getName() + ".mp4");
            builder.redirectErrorStream(true);

            Task<Double> task = new Task<>() {
                @Override
                protected Double call() throws Exception {
                    double totalProgress = 1.0 / videos.size();
                    if (isCancelled())
                        return null;
                    double currentProgress = 0;
                    Process process = builder.start();
                    try (BufferedReader reader = new BufferedReader(
                            new InputStreamReader(process.getInputStream()))) {
                        StringBuilder errorMessage = new StringBuilder();
                        String line;
                        double totalSeconds = 0;

                        while ((line = reader.readLine()) != null) {
                            if (isCancelled()) {
                                process.destroy();
                                break;
                            }
                            if (line.startsWith("[")) {
                                errorMessage.append(line).append("\n");
                            }
                            if (line.toLowerCase().contains("error")) {
                                throw new Exception(errorMessage.toString());
                            }
                            // Find duration
                            Pattern durPattern = Pattern.compile("^\\s*Duration: (\\d+:\\d+:\\d+.\\d+).*");
                            Matcher durMatcher = durPattern.matcher(line);
                            if (durMatcher.matches()) {
                                totalSeconds = calculateSecond(durMatcher.group(1));
                                continue;
                            }
                            Pattern timePattern = Pattern.compile("^.*time=(\\d+:\\d+:\\d+.\\d+).*");
                            Matcher timeMatcher = timePattern.matcher(line);
                            if (timeMatcher.matches()) {
                                double currentSeconds = calculateSecond(timeMatcher.group(1));
                                double updateProgress = currentSeconds * totalProgress / totalSeconds;

                                synchronized (LOCK) {
                                    progressValue += (updateProgress - currentProgress);
                                    updateValue(progressValue);
                                    currentProgress = updateProgress;
                                }
                            }
                        }
                        synchronized (LOCK) {
                            progressValue += (totalProgress - currentProgress);
                            return progressValue;
                        }
                    } finally {
                        latch.countDown();
                    }
                }
            };
            addTask(task);
            Thread thread = new Thread(task);
            task.setOnFailed(event -> {
                LOGGER.error("Error running ffmpeg: ", event.getSource().getException());

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
                    updateTimeLabel(Math.round(newValue * 100) + "%");
                }
            });
            thread.setDaemon(true);
            thread.start();
        }
    }

    private double calculateSecond(String str) {
        String[] hms = str.split(":");
        return Integer.parseInt(hms[0]) * 3600 + Integer.parseInt(hms[1]) * 60 + Double.parseDouble(hms[2]);
    }

}
