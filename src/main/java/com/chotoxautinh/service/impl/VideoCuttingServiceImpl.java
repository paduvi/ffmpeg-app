package com.chotoxautinh.service.impl;

import com.chotoxautinh.conf.Constants;
import com.chotoxautinh.service.VideoCuttingService;
import com.chotoxautinh.util.AppUtil;
import com.chotoxautinh.util.PythonUtil;
import okhttp3.*;
import org.eclipse.jgit.api.CloneCommand;
import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.PullResult;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Duration;
import java.util.Objects;

public class VideoCuttingServiceImpl implements VideoCuttingService {
    private static final Logger LOGGER = LoggerFactory.getLogger(VideoCuttingServiceImpl.class);

    private static final String REMOTE_URL = "https://github.com/paduvi/dogy-image-similarity.git";
    private static final String LOCAL_DIR = Constants.DATA_PATH + File.separator + "dogy-image-similarity";
    private static final String BRANCH = System.getProperty("branch", "dev");

    private static final String HOST = "localhost";
    private static final int PORT = AppUtil.getAvailablePort();
    private Process pythonServerProcess;

    // Private constructor to prevent direct instantiation
    private VideoCuttingServiceImpl() {
    }

    private static final class VideoCuttingServiceHolder {
        private static final VideoCuttingServiceImpl INSTANCE = new VideoCuttingServiceImpl();
    }

    public static VideoCuttingServiceImpl getInstance() {
        return VideoCuttingServiceImpl.VideoCuttingServiceHolder.INSTANCE;
    }

    @Override
    public void initialize() throws GitAPIException, IOException, InterruptedException, URISyntaxException {
        pullProject();
        installDependencies();
        startPythonServer();
    }

    @Override
    public void shutdown() {
        pythonServerProcess.destroy();
    }

    @Override
    public float queryChosenTime(String videoPath, String queryImage) throws IOException {
        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
                .readTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
                .writeTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
                .build();
        String json = String.format("""
                {
                    "input_path": "%s",
                    "query_image": "%s"
                }
                """, videoPath.replace("\\", "/"), queryImage.replace("\\", "/"));
        LOGGER.info("Query chosen time: {}", json);
        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));

        Request request = new Request.Builder()
                .url("http://" + HOST + ":" + PORT + "/api/video/query")
                .post(body)
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (response.isSuccessful()) {
                return Float.parseFloat(Objects.requireNonNull(response.body()).string());
            }
            throw new IOException("Unexpected queryChosenTime response: " + response.code() + " " + response.message());
        }
    }

    @Override
    public void cutVideo(String inputPath, String outputPath, float startTime) throws IOException {
        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
                .readTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
                .writeTimeout(0, java.util.concurrent.TimeUnit.MILLISECONDS)
                .build();
        String json = String.format("""
                {
                    "input_path": "%s",
                    "output_path": "%s",
                    "start_time": %f
                }
                """, inputPath.replace("\\", "/"), outputPath.replace("\\", "/"), startTime);
        LOGGER.info("Cut video: {}", json);
        RequestBody body = RequestBody.create(json, MediaType.get("application/json"));

        Request request = new Request.Builder()
                .url("http://" + HOST + ":" + PORT + "/api/video/cut")
                .post(body)
                .build();

        try (Response response = client.newCall(request).execute()) {
            if (response.isSuccessful()) {
                return;
            }
            throw new IOException("Unexpected cutVideo response: " + response.code() + " " + response.message());
        }
    }

    private void startPythonServer() throws IOException {
        pythonServerProcess = PythonUtil.runPython(Path.of(LOCAL_DIR), "main.py", "--port", String.valueOf(PORT));
        waitForServer("http://" + HOST + ":" + PORT + "/api/echo", Duration.ofSeconds(10).toMillis());
    }

    private void waitForServer(String url, long waitMillis) {
        OkHttpClient client = new OkHttpClient();

        while (true) {
            try {
                String json = """
                        {
                            "name": "Hao",
                            "project": "Sea Group"
                        }
                        """;
                RequestBody body = RequestBody.create(json, MediaType.get("application/json"));

                Request request = new Request.Builder()
                        .url(url)
                        .post(body)
                        .build();

                try (Response response = client.newCall(request).execute()) {
                    if (response.isSuccessful()) {
                        LOGGER.info("✅ Python server is ready: {}", Objects.requireNonNull(response.body()).string());
                        return;
                    }
                }
            } catch (Exception e) {
                LOGGER.warn("⏳ Not ready... will try again");
            }

            try {
                Thread.sleep(waitMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Thread is interrupted", e);
            }
        }
    }

    private void pullProject() throws GitAPIException, IOException {
        File localPath = new File(LOCAL_DIR);

        if (!localPath.exists()) {
            LOGGER.info("Local directory doesn't exist. Cloning from branch {}...", BRANCH);
            CloneCommand clone = Git.cloneRepository()
                    .setURI(REMOTE_URL)
                    .setDirectory(localPath)
                    .setBranch(BRANCH);

            try (Git ignored = clone.call()) {
                LOGGER.info("Cloned repository to {}", localPath.getAbsolutePath());
            }
            return;
        }
        LOGGER.info("Local directory exists. Checking for updates...");
        try (Git git = Git.open(localPath)) {
            PullResult result = git.pull().call();

            if (result.isSuccessful()) {
                LOGGER.info("Pull successful. Updating local repository...");
            } else {
                LOGGER.warn("Pull failed.");
            }
        } catch (Throwable e) {
            Files.deleteIfExists(localPath.toPath());
            pullProject();
        }
    }

    private void installDependencies() throws IOException, InterruptedException {
        String cuda = System.getProperty("cuda", "cpu");
        LOGGER.info("Installing dependencies with CUDA: {}", cuda);
        Process process;
        if (System.getProperty("os.name").toLowerCase().contains("win")) {
            // 1. Read install.bat from resources
            InputStream in = getClass().getResourceAsStream("/install.bat");
            if (in == null) {
                throw new IllegalStateException("install.bat does not exist in resources!");
            }

            // 2. Create a temp file
            Path tempScript = Files.createTempFile("install", ".bat");
            Files.copy(in, tempScript, StandardCopyOption.REPLACE_EXISTING);

            // 3. (optional) delete temp file after JVM quit
            tempScript.toFile().deleteOnExit();

            ProcessBuilder processBuilder = new ProcessBuilder(tempScript.toAbsolutePath().toString(), "cuda=" + cuda);
            processBuilder.directory(new File(LOCAL_DIR));
            processBuilder.redirectErrorStream(true);

            LOGGER.info(String.join(" ", processBuilder.command().toArray(new String[0])));

            process = processBuilder.start();
        } else if (new File(LOCAL_DIR + File.separator + ".venv").exists()) {
            LOGGER.info("Virtual environment exists. Just update dependencies...");
            ProcessBuilder processBuilder = new ProcessBuilder(LOCAL_DIR + File.separator + "update.sh");
            processBuilder.directory(new File(LOCAL_DIR));
            processBuilder.redirectErrorStream(true);
            process = processBuilder.start();
        } else {
            LOGGER.info("Virtual environment doesn't exist. Creating new one...");

            ProcessBuilder processBuilder = new ProcessBuilder(LOCAL_DIR + File.separator + "install.sh", "cuda=" + cuda);
            processBuilder.directory(new File(LOCAL_DIR));
            processBuilder.redirectErrorStream(true);
            process = processBuilder.start();
        }

        // Stream stdout+stderr to SLF4J in a separate thread
        Thread outputThread = getOutputThread(process);

        // Wait for process to finish
        int exitCode = process.waitFor();
        try {
            outputThread.join(); // ensure all output is flushed
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }

        LOGGER.info("Process exited with code: {}", exitCode);
        if (exitCode != 0) {
            throw new RuntimeException("Process exited with code: " + exitCode);
        }
    }

    private Thread getOutputThread(Process process) {
        Thread outputThread = new Thread(() -> {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {

                String line;
                while ((line = reader.readLine()) != null) {
                    LOGGER.info("[script] {}", line);
                }

            } catch (IOException e) {
                LOGGER.error("Error reading process output", e);
                throw new RuntimeException(e);
            }
        });
        outputThread.start();
        return outputThread;
    }
}