package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.mapper.INotificationMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 보호자 알림을 종류별로 일정 기간이 지나면 지운다.
 * <p>
 * - 도착·체크포인트: 7일 (매일 쌓이는 일상 알림)
 * - 경로 이탈·도움요청: 30일 (흐름을 돌아보거나 무슨 일이 있었는지 확인할 수 있게 조금 길게)
 * <p>
 * 알림만 지운다. 이동 기록(TRIP_EVENTS)과 도움요청 기록(HELP_REQUESTS)은 그대로 남는다.
 * 매일 새벽 4시에 한 번, 그리고 서버를 켤 때 한 번 정리한다.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class NotificationCleanupScheduler {

    static final int DAILY_KEEP_DAYS = 7;
    static final int IMPORTANT_KEEP_DAYS = 30;

    private static final List<String> DAILY_TYPES = List.of("ARRIVED", "CHECKPOINT");
    private static final List<String> IMPORTANT_TYPES = List.of("DEVIATION", "HELP_REQUEST");

    private final INotificationMapper notificationMapper;

    @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
    public void cleanUpDaily() {
        cleanUp();
    }

    @EventListener(ApplicationReadyEvent.class)
    public void cleanUpOnStart() {
        cleanUp();
    }

    void cleanUp() {
        try {
            int daily = notificationMapper.deleteOldNotifications(DAILY_TYPES, DAILY_KEEP_DAYS);
            int important = notificationMapper.deleteOldNotifications(IMPORTANT_TYPES, IMPORTANT_KEEP_DAYS);

            if (daily + important > 0) {
                log.info("지난 알림 정리: 도착·체크포인트 {}건({}일 지남), 경로 이탈·도움요청 {}건({}일 지남)",
                        daily, DAILY_KEEP_DAYS, important, IMPORTANT_KEEP_DAYS);
            }
        } catch (Exception e) {
            // 정리에 실패해도 서비스는 그대로 돈다. 다음 정리 때 다시 지운다.
            log.warn("지난 알림 정리 실패", e);
        }
    }
}
