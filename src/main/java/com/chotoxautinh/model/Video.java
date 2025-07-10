package com.chotoxautinh.model;

import java.io.File;
import java.io.IOException;
import java.nio.file.Path;

import com.chotoxautinh.util.Utility;
import javafx.beans.property.BooleanProperty;
import javafx.beans.property.SimpleBooleanProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;

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
            this.type = new SimpleStringProperty(Utility.getMimeType(file.getAbsolutePath()));
        } catch (IOException e) {
            this.type = new SimpleStringProperty("Undetermined");
        }
        this.size = new SimpleStringProperty(Utility.defineSize(file.length()));
        this.duration = new SimpleStringProperty(Utility.getVideoDuration(file));
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

    public StringProperty pathProperty() {
        return path;
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

    public String getDuration() {
        return duration.get();
    }

    public StringProperty durationProperty() {
        return duration;
    }

    public void setDuration(String duration) {
        this.duration.set(duration);
    }
}
