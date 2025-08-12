package com.chotoxautinh.model;

import lombok.Getter;

@Getter
public enum Direction {
    INPUT("D"), OUTPUT("E");

    private final String value;

    Direction(String value) {
        this.value = value;
    }
}
