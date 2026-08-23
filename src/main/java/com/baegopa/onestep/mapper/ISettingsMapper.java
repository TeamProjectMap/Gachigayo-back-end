package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.UserSettingsDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ISettingsMapper {

    /** 설정 한 건. 아직 저장한 적이 없으면 null */
    UserSettingsDTO getUserSettings(@Param("userId") Long userId);

    /**
     * 도착 / 체크포인트 알림 설정 저장
     * <p>
     * 가입할 때 USER_SETTINGS 행을 만들지 않아서, 없으면 만들고 있으면 고친다.
     */
    int upsertArrivalAlarm(@Param("userId") Long userId, @Param("alarmYn") String alarmYn);
}
