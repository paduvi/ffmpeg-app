package com.chotoxautinh.model;

import com.chotoxautinh.util.VideoUtils;
import javafx.beans.property.BooleanProperty;
import javafx.beans.property.SimpleBooleanProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

public class Video {
    private final StringProperty name;
    private final StringProperty path;
    private final StringProperty duration;
    private final StringProperty size;
    private StringProperty type;
    private final BooleanProperty selected;

    public Video(File file) {
        Path p = file.toPath();
        this.name = new SimpleStringProperty(p.getFileName().toString().replaceFirst("[.][^.]+$", ""));
        this.path = new SimpleStringProperty(file.getAbsolutePath());
        try {
            this.type = new SimpleStringProperty(VideoUtils.getMimeType(file.getAbsolutePath()));
        } catch (IOException e) {
            this.type = new SimpleStringProperty("Undetermined");
        }
        this.size = new SimpleStringProperty(VideoUtils.defineSize(file.length()));
        this.duration = new SimpleStringProperty(VideoUtils.getVideoDurationInTimestamp(file));
        this.selected = new SimpleBooleanProperty(false);
    }

    public String getName() {
        return name.get();
    }

    public void setName(String name) {
        this.name.set(name);
    }

    public StringProperty nameProperty() {
        return name;
    }

    public String getType() {
        return type.get();
    }

    public void setType(String type) {
        this.type.set(type);
    }

    public StringProperty typeProperty() {
        return type;
    }

    public String getPath() {
        return path.get();
    }

    public void setPath(String path) {
        this.path.set(path);
    }

    public String getSize() {
        return size.get();
    }

    public void setSize(String size) {
        this.size.set(size);
    }

    public StringProperty sizeProperty() {
        return size;
    }

    public boolean getSelected() {
        return selected.get();
    }

    public void setSelected(boolean selected) {
        this.selected.set(selected);
    }

    public BooleanProperty selectedProperty() {
        return selected;
    }

    public StringProperty durationProperty() {
        return duration;
    }

}
