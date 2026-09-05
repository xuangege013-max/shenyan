package com.shenyan.app
import android.app.AppOpsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
@CapacitorPlugin(name = "AppUsage")
class AppUsagePlugin : Plugin() {
    @PluginMethod
    fun hasPermission(call: PluginCall) {
        val ctx = context
        val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), ctx.packageName)
        val ret = JSObject()
        ret.put("granted", mode == AppOpsManager.MODE_ALLOWED)
        call.resolve(ret)
    }
    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }
    @PluginMethod
    fun getTopApps(call: PluginCall) {
        val ctx = context
        val usm = ctx.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, now - 24 * 60 * 60 * 1000L, now)
        val pm = ctx.packageManager
        val apps = stats.filter { it.totalTimeInForeground > 0 }
            .sortedByDescending { it.totalTimeInForeground }
            .take(10)
            .map {
                val obj = JSObject()
                obj.put("packageName", it.packageName)
                obj.put("appName", try { pm.getApplicationLabel(pm.getApplicationInfo(it.packageName, 0)).toString() } catch (e: Exception) { it.packageName })
                obj.put("minutes", it.totalTimeInForeground / 60000f)
                obj
            }
        val ret = JSObject()
        ret.put("apps", apps)
        call.resolve(ret)
    }
}
