package com.chotoxautinh.model;

import lombok.Getter;

@Getter
public enum AudioCodec {
    AAC("AAC", "aac"),
    MP3("MP3", "libmp3lame"),
    COPY("COPY", "copy");

    private final String label;
    private final String value;

    AudioCodec(String label, String value) {
        this.label = label;
        this.value = value;
    }

    // Get value from label
    public static String getValue(String label) {
        for (AudioCodec status : values()) {
            if (status.label.equalsIgnoreCase(label)) {
                return status.value;
            }
        }
        return null;
    }
}
