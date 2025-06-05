package com.chotoxautinh.controller;

import com.chotoxautinh.Main;

import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;

public class RootController {

	private Main mainApp;

	@FXML
	private void handleAboutAction(ActionEvent event) {
		Alert alert = new Alert(AlertType.INFORMATION);
		alert.setTitle("© 2016 - Dogy. All rights reserved.");
		alert.setHeaderText("Contact me at:");
		StringBuilder builder = new StringBuilder();
		builder.append("• Linkedin: vietphanduc\n");
		builder.append("• Phone: 0985797649\n");
		builder.append("• Email: viet3695@gmail.com\n");
		alert.setContentText(builder.toString());

		alert.showAndWait();
	}

	@FXML
	private void handleExitAction(ActionEvent event) {
		mainApp.getPrimaryStage().close();
	}

	public void setMainApp(Main mainApp) {
		this.mainApp = mainApp;
	}
}
