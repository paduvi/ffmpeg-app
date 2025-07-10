package com.chotoxautinh.util;

import javafx.animation.PauseTransition;
import javafx.scene.control.Alert;
import javafx.scene.control.Button;
import javafx.util.Duration;
import org.bytedeco.ffmpeg.avformat.AVFormatContext;
import org.bytedeco.ffmpeg.avutil.AVDictionary;
import org.bytedeco.ffmpeg.global.avformat;
import org.bytedeco.ffmpeg.global.avutil;

import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;

public class Utility {

    public static void alertError(Throwable e) {
        alertError(e.getMessage());
    }

    public static void alertError(String message) {
        Alert alert = new Alert(Alert.AlertType.ERROR);
        alert.setTitle("Error");
        alert.setHeaderText(null);
        alert.setContentText(message);

        alert.showAndWait();
    }

    public static void handleThrottle(Button button, Duration duration) {
        // Disable the button
        button.setDisable(true);

        // Create a PauseTransition for 2 seconds
        PauseTransition pause = new PauseTransition(duration);

        // Enable the button after the delay
        pause.setOnFinished(e -> button.setDisable(false));
        pause.play();
    }

    public static String defineSize(double size) {
        String unit = "Byte";
        if (size > 1024) {
            size /= 1024;
            unit = "KB";
        }
        if (size > 1024) {
            size /= 1024;
            unit = "MB";
        }
        if (size > 1024) {
            size /= 1024;
            unit = "GB";
        }
        if (size > 1024) {
            size /= 1024;
            unit = "TB";
        }
        BigDecimal bd = new BigDecimal(size);
        bd = bd.setScale(2, RoundingMode.HALF_UP);
        return bd.doubleValue() + unit;
    }

    public static String getVideoDuration(File videoFile) {
        avutil.av_log_set_level(avutil.AV_LOG_ERROR);

        AVFormatContext formatContext = avformat.avformat_alloc_context();

        try {
            // Open the video file
            if (avformat.avformat_open_input(formatContext, videoFile.getAbsolutePath(), null, null) < 0) {
                throw new RuntimeException("Failed to open video file: " + videoFile.getAbsolutePath());
            }

            // Read stream information
            if (avformat.avformat_find_stream_info(formatContext, (AVDictionary) null) < 0) {
                throw new RuntimeException("Failed to find stream info for: " + videoFile.getAbsolutePath());
            }

            // Retrieve duration in seconds
            long durationInSeconds = formatContext.duration() / avutil.AV_TIME_BASE;

            // Format duration as HH:mm:ss
            long hours = durationInSeconds / 3600;
            long minutes = (durationInSeconds % 3600) / 60;
            long seconds = durationInSeconds % 60;
            return String.format("%02d:%02d:%02d", hours, minutes, seconds);

        } catch (Exception e) {
            e.printStackTrace();
            return "Unknown";
        } finally {
            // Free resources
            avformat.avformat_free_context(formatContext);
        }
    }

    public static String getMimeType(String absolutePath) throws IOException {
        String mimeType = Files.probeContentType(Path.of(absolutePath));
        return mimeType;
    }
}