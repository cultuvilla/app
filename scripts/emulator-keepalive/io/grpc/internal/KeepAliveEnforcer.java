package io.grpc.internal;

import java.util.concurrent.TimeUnit;

/**
 * Drop-in for grpc-java's server-side KeepAliveEnforcer inside the Firestore
 * emulator jar, loaded ahead of the jar's own copy via -Xbootclasspath/a
 * (scripts/lib/emulator-keepalive.mjs). Why it exists:
 * docs/decisions/ios-e2e-emulator-keepalive.md.
 *
 * The emulator builds its gRPC server with grpc-java's defaults: a client may
 * ping once every 5 minutes, and only while a call is open. The Firestore SDKs
 * ping every 30 s, which production Firestore accepts; the emulator answers the
 * third such ping with GOAWAY too_many_pings and drops the connection. This copy
 * keeps grpc-java's logic and public API and changes only the two limits, read
 * from system properties so the policy is stated where the JVM is started:
 *
 *   cultuvilla.emulator.permitKeepAliveTimeMs        floor on the caller's minimum (required)
 *   cultuvilla.emulator.permitKeepAliveWithoutCalls  "true" to accept pings with no call open
 *
 * No dependency outside java.*: the boot class loader cannot see the jar's Guava.
 */
public final class KeepAliveEnforcer {
  public static final int MAX_PING_STRIKES = 2;
  public static final long IMPLICIT_PERMIT_TIME_NANOS = TimeUnit.HOURS.toNanos(2L);

  private static final long PERMIT_TIME_NANOS;
  private static final boolean PERMIT_WITHOUT_CALLS;

  static {
    String ms = System.getProperty("cultuvilla.emulator.permitKeepAliveTimeMs");
    if (ms == null) {
      throw new IllegalStateException("cultuvilla.emulator.permitKeepAliveTimeMs is not set");
    }
    PERMIT_TIME_NANOS = TimeUnit.MILLISECONDS.toNanos(Long.parseLong(ms));
    PERMIT_WITHOUT_CALLS = Boolean.getBoolean("cultuvilla.emulator.permitKeepAliveWithoutCalls");
    // The lane reads this line from the emulator log to prove the policy took.
    System.err.println("[emulator-keepalive] client pings permitted every "
        + ms + " ms, without calls: " + PERMIT_WITHOUT_CALLS);
  }

  private final boolean permitWithoutCalls;
  private final long minTimeNanos;
  private final Ticker ticker;
  private final long epoch;
  private long lastValidPingTime;
  private boolean hasOutstandingCalls;
  private int pingStrikes;

  public KeepAliveEnforcer(boolean permitWithoutCalls, long minTime, TimeUnit unit) {
    this(permitWithoutCalls, minTime, unit, SystemTicker.INSTANCE);
  }

  KeepAliveEnforcer(boolean permitWithoutCalls, long minTime, TimeUnit unit, Ticker ticker) {
    if (minTime < 0L) {
      throw new IllegalArgumentException("minTime must be non-negative: " + minTime);
    }
    this.permitWithoutCalls = permitWithoutCalls || PERMIT_WITHOUT_CALLS;
    this.minTimeNanos = Math.min(Math.min(unit.toNanos(minTime), PERMIT_TIME_NANOS), IMPLICIT_PERMIT_TIME_NANOS);
    this.ticker = ticker;
    this.epoch = ticker.nanoTime();
    this.lastValidPingTime = this.epoch;
  }

  public boolean pingAcceptable() {
    long now = ticker.nanoTime();
    boolean valid;
    if (!hasOutstandingCalls && !permitWithoutCalls) {
      valid = lastValidPingTime + IMPLICIT_PERMIT_TIME_NANOS - now <= 0L;
    } else {
      valid = lastValidPingTime + minTimeNanos - now <= 0L;
    }
    if (!valid) {
      pingStrikes++;
      return pingStrikes <= MAX_PING_STRIKES;
    }
    lastValidPingTime = now;
    return true;
  }

  public void resetCounters() {
    lastValidPingTime = epoch;
    pingStrikes = 0;
  }

  public void onTransportActive() {
    hasOutstandingCalls = true;
  }

  public void onTransportIdle() {
    hasOutstandingCalls = false;
  }

  static final class SystemTicker implements Ticker {
    static final SystemTicker INSTANCE = new SystemTicker();

    @Override
    public long nanoTime() {
      return System.nanoTime();
    }
  }

  interface Ticker {
    long nanoTime();
  }
}
