import com.chotoxautinh.controller.compression.CompressionProgressController;
import org.junit.Test;

import java.util.regex.Matcher;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class TestRegEx {
    @Test
    public void testRegEx() {
        String text = "speframe=  236 fps= 24 q=28.0 q=28.0 size=    1693kB time=00:00:09.53 bitrate=1454.2kbits/s";
        Matcher matcher = CompressionProgressController.TIME_PATTERN.matcher(text);

        assertTrue(matcher.matches());
        assertEquals("00:00:09.53", matcher.group(1));
    }
}
