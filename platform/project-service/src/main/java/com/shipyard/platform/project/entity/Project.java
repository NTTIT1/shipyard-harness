package com.shipyard.platform.project.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "projects")
public class Project {

    @Id
    private String id;

    @Column(nullable = false, unique = true, length = 50)
    private String slug;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 500)
    private String repoUrl;

    @Column(nullable = false, length = 100)
    private String defaultBranch = "development";

    @Column(length = 100)
    private String figmaFileKey;

    @Column(columnDefinition = "TEXT")
    private String designSystemJson;

    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal monthlyBudgetUsd = new BigDecimal("100.00");

    @Column(nullable = false, length = 20)
    private String status = "ACTIVE";

    @Column(nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Project() {}

    public Project(String id, String slug, String name, String repoUrl, String defaultBranch) {
        this.id = id;
        this.slug = slug;
        this.name = name;
        this.repoUrl = repoUrl;
        this.defaultBranch = defaultBranch != null ? defaultBranch : "development";
        this.monthlyBudgetUsd = new BigDecimal("100.00");
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
    }

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

    public String getDesignSystemJson() { return designSystemJson; }
    public void setDesignSystemJson(String designSystemJson) { this.designSystemJson = designSystemJson; }

    public BigDecimal getMonthlyBudgetUsd() { return monthlyBudgetUsd; }
    public void setMonthlyBudgetUsd(BigDecimal monthlyBudgetUsd) { this.monthlyBudgetUsd = monthlyBudgetUsd; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
