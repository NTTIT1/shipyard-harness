package com.shipyard.platform.common.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

public class ProjectDto {
    private String id;
    private String slug;
    private String name;
    private String repoUrl;
    private String defaultBranch;
    private String figmaFileKey;
    private Map<String, Object> designSystemConfig;
    private BigDecimal monthlyBudgetUsd;
    private String status;
    private String currentUserRole;
    private Instant createdAt;

    public ProjectDto() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRepoUrl() { return repoUrl; }
    public void setRepoUrl(String repoUrl) { this.repoUrl = repoUrl; }

    public String getDefaultBranch() { return defaultBranch; }
    public void setDefaultBranch(String defaultBranch) { this.defaultBranch = defaultBranch; }

    public String getFigmaFileKey() { return figmaFileKey; }
    public void setFigmaFileKey(String figmaFileKey) { this.figmaFileKey = figmaFileKey; }

    public Map<String, Object> getDesignSystemConfig() { return designSystemConfig; }
    public void setDesignSystemConfig(Map<String, Object> designSystemConfig) { this.designSystemConfig = designSystemConfig; }

    public BigDecimal getMonthlyBudgetUsd() { return monthlyBudgetUsd; }
    public void setMonthlyBudgetUsd(BigDecimal monthlyBudgetUsd) { this.monthlyBudgetUsd = monthlyBudgetUsd; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCurrentUserRole() { return currentUserRole; }
    public void setCurrentUserRole(String currentUserRole) { this.currentUserRole = currentUserRole; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
