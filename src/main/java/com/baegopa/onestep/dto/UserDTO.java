package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;
import lombok.ToString;

import java.time.LocalDateTime;

@Getter
@Setter
@ToString
public class UserDTO {

    private Long userId;
    private String userName;
    private String userRole;
    private String loginId;
    private String password;
    private String phone;
    private String email;
    private String linkCode;
    private String pushToken;
    private LocalDateTime regDt;
    private LocalDateTime updDt;
}
