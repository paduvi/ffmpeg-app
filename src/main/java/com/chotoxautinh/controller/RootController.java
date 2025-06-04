package com.chotoxautinh.controller;

import java.util.Optional;

import com.chotoxautinh.Main;

import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.TextInputDialog;

public class RootController {

	private Main mainApp;

	@FXML
	private void handleAboutAction(ActionEvent event) {
		Alert alert = new Alert(AlertType.INFORMATION);
		alert.setTitle("ChoToXauTinh - © 2016");
		alert.setHeaderText("Contact me at:");
		StringBuilder builder = new StringBuilder();
		builder.append("• Class: Advanced IT 2013 - HUST\n");
		builder.append("• Company: Techmaster\n");
		builder.append("• Phone: 0985797649\n");
		builder.append("• Email: viet@techmaster.vn\n");
		alert.setContentText(builder.toString());

		alert.showAndWait();
	}

	@FXML
	private void handleExitAction(ActionEvent event) {
		mainApp.getPrimaryStage().close();
	}

	@FXML
	private void handleHelpAction(ActionEvent event) {
		TextInputDialog dialog = new TextInputDialog(mainApp.getBinaryPath());

		dialog.setTitle("Hướng dẫn sử dụng");
		StringBuilder builder = new StringBuilder();
		builder.append("· Cài đặt Homebrew: Truy cập http://brew.sh/\n");
		builder.append("· Cài đặt FFMPEG: brew install ffmpeg\n");
		builder.append("· Tìm đường dẫn FFMPEG: which ffmpeg\n");
		dialog.setHeaderText(builder.toString());
		dialog.setContentText("Please input ffmpeg binary path:");

		// Traditional way to get the response value.
		Optional<String> result = dialog.showAndWait();
		if (result.isPresent()) {
			mainApp.setBinaryPath(result.get().trim());
		}
	}

	public void setMainApp(Main mainApp) {
		this.mainApp = mainApp;
	}
}
