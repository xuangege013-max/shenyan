package com.shenyan.app
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale
@CapacitorPlugin(name = "Speech")
class SpeechPlugin : Plugin() {
    private var tts: TextToSpeech? = null
    private var recognizer: SpeechRecognizer? = null
    private var pendingCall: PluginCall? = null
    @PluginMethod
    fun speak(call: PluginCall) {
        val text = call.getString("text") ?: ""
        val doSpeak = {
            tts?.language = Locale.CHINA
            tts?.setSpeechRate(1.0f)
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "shenyan")
        }
        if (tts == null) {
            tts = TextToSpeech(context) { status -> if (status == TextToSpeech.SUCCESS) doSpeak() }
        } else doSpeak()
        call.resolve()
    }
    @PluginMethod
    fun listen(call: PluginCall) {
        val activity = bridge.activity
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.RECORD_AUDIO), 1001)
            call.reject("请先授权麦克风权限，再点一次语音输入")
            return
        }
        if (recognizer != null) recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(activity)
        pendingCall = call
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
                val ret = JSObject(); ret.put("value", text)
                pendingCall?.resolve(ret); pendingCall = null
            }
            override fun onError(error: Int) {
                pendingCall?.reject("语音识别失败，错误码 $error"); pendingCall = null
            }
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        recognizer?.startListening(intent)
    }
}
