package com.chotoxautinh.model;

public enum MenuSection {
    VIDEO_COMPRESSION("Video Compression", "VideoCompressionLayout.fxml"),
    VIDEO_CUTTING("Video Cutting", "VideoCuttingLayout.fxml");
    // Add more sections here in the future

    private final String label;
    private final String fxmlPath;

    MenuSection(String label, String fxmlPath) {
        this.label = label;
        this.fxmlPath = fxmlPath;
    }

    public String getLabel() {
        return label;
    }

    public String getFxmlPath() {
        return fxmlPath;
    }
}
