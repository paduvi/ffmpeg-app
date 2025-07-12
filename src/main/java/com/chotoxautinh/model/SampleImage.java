package com.chotoxautinh.model;

public class SampleImage {
    private Integer id;
    private final String name;
    private final boolean permanent;
    private final String path;

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

    public Integer getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public boolean isPermanent() {
        return permanent;
    }

    public String getPath() {
        return path;
    }

    public SampleImage setId(Integer id) {
        this.id = id;
        return this;
    }
}
