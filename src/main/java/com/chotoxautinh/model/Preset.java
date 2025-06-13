package com.chotoxautinh.model;

public enum Preset {
    ULTRAFAST("Ultra Fast", "ultrafast"),
    SUPERFAST("Super Fast", "superfast"),
    VERYFAST("Very Fast", "veryfast"),
    FASTER("Faster", "faster"),
    FAST("Fast", "fast"),
    MEDIUM("Medium", "medium"),
    SLOW("Slow", "slow"),
    SLOWER("Slower", "slower"),
    VERYSLOW("Very Slow", "veryslow"),;

    private final String label;
    private final String value;

    Preset(String label, String value) {
        this.label = label;
        this.value = value;
    }

    public String getLabel() {
        return label;
    }

    public String getValue() {
        return value;
    }

    // Get value from label
    public static String getValue(String label) {
        for (Preset status : values()) {
            if (status.label.equalsIgnoreCase(label)) {
                return status.value;
            }
        }
        return null;
    }
}
