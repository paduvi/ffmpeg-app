package com.chotoxautinh.util;

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
import java.util.logging.Level;
import java.util.logging.Logger;

public class VideoUtil {
    private static final Logger LOGGER = Logger.getLogger(VideoUtil.class.getName());

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
            LOGGER.log(Level.SEVERE, "Error getting video duration: " + videoFile.getAbsolutePath(), e);
            return "Unknown";
        } finally {
            // Free resources
            avformat.avformat_free_context(formatContext);
        }
    }

    public static String getMimeType(String absolutePath) throws IOException {
        return Files.probeContentType(Path.of(absolutePath));
    }

}