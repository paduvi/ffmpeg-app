package com.chotoxautinh.model;

import lombok.Getter;

@Getter
public enum MenuSection {
    VIDEO_COMPRESSION("Size Reduction", "VideoCompressionLayout.fxml"),
    VIDEO_CUTTING("Frame Cut", "VideoCuttingLayout.fxml");
    // Add more sections here in the future

    private final String label;
    private final String fxmlPath;

    MenuSection(String label, String fxmlPath) {
        this.label = label;
        this.fxmlPath = fxmlPath;
    }
}
