package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

/** 카카오 길안내 문구와 AI가 바꾼 쉬운 문장 한 쌍 (EASY_GUIDE_TEXTS) */
@Getter
@Setter
public class EasyGuideTextDTO {

    private Long easyGuideTextId;
    private String originalHash;
    private String originalText;
    private String easyText;
    private String model;
}
