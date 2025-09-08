package com.chotoxautinh.service.impl;

import com.chotoxautinh.conf.AppConfig;
import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.model.AudioCodec;
import com.chotoxautinh.model.Preset;
import com.chotoxautinh.service.VideoCompressionService;
import com.chotoxautinh.util.VideoUtils;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.prefs.Preferences;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class VideoCompressionServiceImpl implements VideoCompressionService {
    private final Preferences prefs = Preferences.userNodeForPackage(AppConfig.class);

    public final static Pattern DURATION_PATTERN = Pattern.compile("^\\s*Duration: (\\d+:\\d+:\\d+.\\d+).*");
    public final static Pattern TIME_PATTERN = Pattern.compile("^.*time=(\\d+:\\d+:\\d+.\\d+).*");

    // Private constructor to prevent direct instantiation
    private VideoCompressionServiceImpl() {
    }

    private static final class VideoCompressionServiceHolder {
        private static final VideoCompressionServiceImpl INSTANCE = new VideoCompressionServiceImpl();
    }

    public static VideoCompressionServiceImpl getInstance() {
        return VideoCompressionServiceHolder.INSTANCE;
    }

    @Override
    public void compressVideo(String inputPath, String outputPath, Supplier<Boolean> isCancelled, Consumer<Double> consumer) throws IOException {
        // ffmpeg -i {inputPath} -c:v h264 -c:a aac -preset medium -crf 23 {outputPath}
        ProcessBuilder builder = new ProcessBuilder(VideoUtils.getBinaryPath(), "-i", inputPath, "-c:v", "h264",
                "-c:a", getAudioCodec(), "-preset", getPreset(), "-crf", String.valueOf(getCrf()),
                outputPath);
        builder.redirectErrorStream(true);
        Process process = builder.start();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream()))) {
            StringBuilder errorMessage = new StringBuilder();
            String line;
            double totalSeconds = 0;

            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    break;
                }
                if (isCancelled.get()) {
                    process.destroy();
                    break;
                }
                if (line.startsWith("[")) {
                    errorMessage.append(line).append("\n");
                }
                if (line.toLowerCase().contains("error")) {
                    throw new IOException(errorMessage.toString());
                }
                // Find duration
                Matcher durMatcher = DURATION_PATTERN.matcher(line);
                if (durMatcher.matches()) {
                    totalSeconds = calculateSecond(durMatcher.group(1));
                    continue;
                }
                Matcher timeMatcher = TIME_PATTERN.matcher(line);
                if (timeMatcher.matches()) {
                    double currentSeconds = calculateSecond(timeMatcher.group(1));
                    double updateProgress = currentSeconds / totalSeconds;

                    consumer.accept(updateProgress);
                }
            }
        }
    }

    private double calculateSecond(String str) {
        String[] hms = str.split(":");
        return Integer.parseInt(hms[0]) * 3600 + Integer.parseInt(hms[1]) * 60 + Double.parseDouble(hms[2]);
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
}
