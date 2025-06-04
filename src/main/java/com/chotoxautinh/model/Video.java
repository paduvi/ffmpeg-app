package com.chotoxautinh.model;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Path;

import javafx.beans.property.BooleanProperty;
import javafx.beans.property.SimpleBooleanProperty;
import javafx.beans.property.SimpleStringProperty;
import javafx.beans.property.StringProperty;

public class Video {
	private StringProperty name;
	private StringProperty path;
	private StringProperty size;
	private StringProperty type;
	private BooleanProperty selected;

	public Video(File file) {
		Path p = file.toPath();
		this.name = new SimpleStringProperty(p.getFileName().toString().replaceFirst("[.][^.]+$", ""));
		this.path = new SimpleStringProperty(file.getAbsolutePath());
		try {
			this.type = new SimpleStringProperty(mimetype(file.getAbsolutePath()));
		} catch (IOException e) {
			this.type = new SimpleStringProperty("Undetermined");
		}
		this.size = new SimpleStringProperty(defineSize(file.length()));
		this.selected = new SimpleBooleanProperty(false);
	}

	private String defineSize(double size) {
		String unit = "Byte";
		if (size > 1024) {
			size /= 1024;
			unit = "KB";
		}
		if (size > 1024) {
			size /= 1024;
			unit = "MB";
		}
		if (size > 1024) {
			size /= 1024;
			unit = "GB";
		}
		if (size > 1024) {
			size /= 1024;
			unit = "TB";
		}
		BigDecimal bd = new BigDecimal(size);
	    bd = bd.setScale(2, RoundingMode.HALF_UP);
		return bd.doubleValue() + unit;
	}

	private String mimetype(String file) throws IOException {

		// 1. run cmd
		Process cmd = Runtime.getRuntime().exec("file --mime-type " + file);

		// 2 get output of cmd , then
		StringBuilder output = new StringBuilder();
		String line;
		BufferedReader in = new BufferedReader(new InputStreamReader(cmd.getInputStream()));
		while ((line = in.readLine()) != null) {
			output.append(line);
		}
		in.close();
		// 3. parse mimetype
		if (output.length() > 0) {
			return output.toString().split(":")[1].trim();
		}
		return "";
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
}
