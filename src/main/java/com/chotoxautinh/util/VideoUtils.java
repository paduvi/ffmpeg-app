package com.chotoxautinh.util;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.model.Direction;
import lombok.extern.slf4j.Slf4j;
import org.bytedeco.ffmpeg.avformat.AVFormatContext;
import org.bytedeco.ffmpeg.avutil.AVDictionary;
import org.bytedeco.ffmpeg.global.avformat;
import org.bytedeco.ffmpeg.global.avutil;
import org.bytedeco.javacpp.Loader;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.prefs.Preferences;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
public class VideoUtils {

    private static final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    public static Map<String, String> getSupportedExtension(Direction direction) throws InterruptedException, IOException {
        Map<String, String> result = new TreeMap<>();
        // Determine the correct FFmpeg command
        List<String> command = new ArrayList<>();
        command.add(getBinaryPath());
        switch (direction) {
            case INPUT -> command.add("-demuxers");
            case OUTPUT -> command.add("-muxers");
            default -> throw new IllegalArgumentException("Invalid direction. Must be 'INPUT', or 'OUTPUT'.");
        }

        ProcessBuilder pb = new ProcessBuilder(command);
        Process process = pb.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            String line;
            boolean startParsing = false;
            Pattern pattern = Pattern.compile("^\\s*([D\\sE]{2})\\s+(\\S+)\\s+(.*)$");

            while ((line = reader.readLine()) != null) {
                if (!startParsing) {
                    if (line.contains("---")) {
                        startParsing = true;
                    }
                    continue;
                }

                Matcher matcher = pattern.matcher(line);
                if (matcher.find()) {
                    String flag = matcher.group(1).trim();
                    String ext = matcher.group(2).trim();
                    String desc = matcher.group(3).trim();

                    // Apply filter based on input type
                    String regex = "[" + Pattern.quote(direction.getValue()) + "]";
                    if (flag.matches(".*" + regex + ".*")) {
                        result.put(ext, desc);
                    }
                }
            }

            process.waitFor();
        }

        return result;
    }

    public static String getBinaryPath() {
        if (prefs.getBoolean(Constants.USE_DEFAULT_FFMPEG_KEY, true))
            return Loader.load(org.bytedeco.ffmpeg.ffmpeg.class);
        return prefs.get(Constants.FFMPEG_LOCATION_KEY, Loader.load(org.bytedeco.ffmpeg.ffmpeg.class));
    }

    public static String getFileExtension(String filePath) {
        if (filePath == null) return null;

        int lastDot = filePath.lastIndexOf('.');
        int lastSeparator = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));

        if (lastDot > lastSeparator) {
            return filePath.substring(lastDot).toLowerCase(); // Keep the dot
        }

        return "";
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