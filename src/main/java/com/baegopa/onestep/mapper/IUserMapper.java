package com.baegopa.onestep.mapper;

import com.baegopa.onestep.dto.UserDTO;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface IUserMapper {

    int getLoginIdCount(String loginId);

    int getEmailCount(String email);

    int getLinkCodeCount(String linkCode);

    UserDTO getUserByLinkCode(String linkCode);

    UserDTO getUserByLoginId(String loginId);

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

    int insertUser(UserDTO userDTO);

    int insertGuardianLink(@Param("userId") Long userId, @Param("guardianId") Long guardianId);
}
