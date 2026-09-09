package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.dto.UserSettingsDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface IUserMapper {

    int getLoginIdCount(String loginId);

    int getEmailCount(String email);

    int getLinkCodeCount(String linkCode);

    UserDTO getUserByLinkCode(String linkCode);

    UserDTO getUserByLoginId(String loginId);

    /** 설정 화면에서 내 이름·연락처를 보여주기 위한 조회 */
    UserDTO getUserById(@Param("userId") Long userId);

    /*
     * 아이디 찾기, 비밀번호 찾기
     */
    UserDTO searchUser(UserDTO userDTO);

    int updatePassword(UserDTO userDTO);

    String getGuardianNameByUserId(Long userId);

    String getUserNameByGuardianId(Long guardianId);

    /** 이용자가 보호자에게 알려줄 연결코드 */
    String getLinkCodeByUserId(@Param("userId") Long userId);

    /** 연결코드 다시 받기 */
    int updateLinkCode(@Param("userId") Long userId, @Param("linkCode") String linkCode);

    UserSettingsDTO getUserSettings(@Param("userId") Long userId);

    int upsertUserSettings(UserSettingsDTO userSettingsDTO);

    int insertUser(UserDTO userDTO);

    int insertGuardianLink(@Param("userId") Long userId, @Param("guardianId") Long guardianId);
}
