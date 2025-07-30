package com.chotoxautinh.util;

import lombok.extern.slf4j.Slf4j;
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

@Slf4j
public class VideoUtils {

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

    public static long getVideoDuration(File videoFile) {
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
            return formatContext.duration() / avutil.AV_TIME_BASE;
        } finally {
            // Free resources
            if (formatContext != null && !formatContext.isNull()) {
                avformat.avformat_close_input(formatContext);
            }
            avformat.avformat_free_context(formatContext);
        }
    }

    public static String getVideoDurationInTimestamp(File videoFile) {
        try {
            // Retrieve duration in seconds
            long durationInSeconds = getVideoDuration(videoFile);

            // Format duration as HH:mm:ss
            long hours = durationInSeconds / 3600;
            long minutes = (durationInSeconds % 3600) / 60;
            long seconds = durationInSeconds % 60;
            return String.format("%02d:%02d:%02d", hours, minutes, seconds);
        } catch (Exception e) {
            log.error("Error getting video duration: {}", videoFile.getAbsolutePath(), e);
            return "Unknown";
        }
    }

    public static String getMimeType(String absolutePath) throws IOException {
        return Files.probeContentType(Path.of(absolutePath));
    }

}