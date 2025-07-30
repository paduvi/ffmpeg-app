package com.chotoxautinh.model;

import javafx.beans.property.BooleanProperty;
import javafx.beans.property.SimpleBooleanProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;
import lombok.Getter;

public class SampleImage {
    @Getter
    private Integer id;
    @Getter
    private final String name;
    @Getter
    private final boolean permanent;
    @Getter
    private final String path;
    private final BooleanProperty selected = new SimpleBooleanProperty(false);
    private final BooleanProperty deleteVisible = new SimpleBooleanProperty(true);

    public SampleImage(int id, String name, boolean permanent, String path) {
        this.id = id;
        this.name = name;
        this.permanent = permanent;
        this.path = path;
    }

    public SampleImage(String name, boolean permanent, String path) {
        this.name = name;
        this.permanent = permanent;
        this.path = path;
    }

    public SampleImage setId(Integer id) {
        this.id = id;
        return this;
    }

    public StringProperty nameProperty() {
        return new SimpleStringProperty(name);
    }

    public void setSelected(boolean selected) {
        this.selected.set(selected);
    }

    public BooleanProperty selectedProperty() {
        return selected;
    }

    public void setDeleteVisible(boolean deleteVisible) {
        this.deleteVisible.set(deleteVisible);
    }

    public BooleanProperty deleteVisibleProperty() {
        return deleteVisible;
    }
}
