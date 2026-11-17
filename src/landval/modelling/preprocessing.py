"""``PipelinePreprocessor`` — copied verbatim from Notebook 3 Cell 3.2.

The notebook serialises a fitted preprocessor with ``to_dict()`` and the
backend reconstructs it with ``from_dict()``.  Any drift between this class
and the notebook's would silently change the model's input frame and break
prediction parity, so the body below is a verbatim copy of Cell 3.2's class
definition (only the module docstring and the import block above the class
were added).  Do **not** edit the class body without re-running Cell 8.3's
round-trip test against the saved artefacts.
"""

from __future__ import annotations

import pandas as pd

# Cell 3.2 — the threshold copied verbatim (the notebook defines it at module
# level just above the class).  Kept here so the docstring's reference to
# ``MIN_CATEGORY_ROWS`` resolves if a caller imports it.
MIN_CATEGORY_ROWS = 5  # categories with fewer training rows than this become "Other"


class PipelinePreprocessor:
    """Fit-on-training-rows preprocessing producing model-specific feature matrices.

    fit() learns, from the training frame only:
      - numeric medians (for the TabNet imputation) and which numeric columns need a
        missing-value indicator column for TabNet,
      - category level lists after grouping rare levels (< MIN_CATEGORY_ROWS) into
        "Other" (unseen values at transform time also map to "Other"),
      - label encodings for the TabNet view.
    transform_xgb()      -> DataFrame, categoricals as pandas category dtype;
                            numeric NaNs KEPT (XGBoost handles them natively)
    transform_catboost() -> DataFrame, categoricals as plain strings;
                            numeric NaNs KEPT (CatBoost handles them natively)
    transform_tabnet()   -> all-numeric DataFrame: label-encoded categoricals,
                            numerics imputed with training medians and standardised
                            with training statistics, plus missing-indicator columns
    """

    def __init__(self, feature_cols, categorical_cols, min_category_rows=MIN_CATEGORY_ROWS):
        self.feature_cols = list(feature_cols)
        self.categorical_cols = [c for c in categorical_cols if c in self.feature_cols]
        self.numeric_cols = [c for c in self.feature_cols if c not in self.categorical_cols]
        self.min_category_rows = int(min_category_rows)

    def fit(self, frame):
        d = frame[self.feature_cols].copy()
        self.medians_ = {}
        self.missing_indicator_cols_ = []
        for c in self.numeric_cols:
            self.medians_[c] = float(d[c].median()) if d[c].notna().any() else 0.0
            if d[c].isna().any():
                self.missing_indicator_cols_.append(c + "_was_missing")
        # TabNet numeric input standardisation (training statistics only). Raw-scale inputs
        # with TabNet's slowly-adapting BatchNorm running statistics diverge on small folds;
        # standardised inputs keep the network in a sane range whatever the batch size.
        self.tabnet_stats_ = {}
        for c in self.numeric_cols:
            filled = d[c].fillna(self.medians_[c])
            s = float(filled.std(ddof=0)) if len(filled) > 1 else 0.0
            self.tabnet_stats_[c] = [float(filled.mean()), s if s > 1e-8 else 1.0]
        self.levels_ = {}
        self.group_maps_ = {}
        self.label_maps_ = {}
        for c in self.categorical_cols:
            vals = d[c].fillna("Missing").astype(str)
            vc = vals.value_counts()
            keep = sorted(vc[vc >= self.min_category_rows].index.tolist())
            self.levels_[c] = keep + ["Other"]
            self.group_maps_[c] = {v: (v if v in keep else "Other") for v in vc.index}
            self.label_maps_[c] = {v: i for i, v in enumerate(self.levels_[c])}
        return self

    def _clean(self, frame, impute_numeric=False):
        """Categoricals -> grouped strings; numeric NaNs kept unless impute_numeric."""
        out = frame.reindex(columns=self.feature_cols).copy()
        for c in self.categorical_cols:
            out[c] = (
                out[c]
                .fillna("Missing")
                .astype(str)
                .map(lambda v, c=c: self.group_maps_[c].get(v, "Other"))
            )
        if impute_numeric:
            for c in self.numeric_cols:
                out[c] = out[c].fillna(self.medians_[c])
        return out

    def transform_xgb(self, frame):
        out = self._clean(frame)  # numeric NaNs kept -> native handling
        for c in self.categorical_cols:
            out[c] = pd.Categorical(out[c], categories=self.levels_[c])
        return out

    def transform_catboost(self, frame):
        return self._clean(frame)  # numeric NaNs kept -> native handling

    def transform_tabnet(self, frame):
        out = self._clean(frame, impute_numeric=True)
        raw = frame.reindex(columns=self.feature_cols).copy()
        for c in self.categorical_cols:
            out[c] = out[c].map(self.label_maps_[c]).astype(float)
        for c in self.missing_indicator_cols_:
            out[c] = raw[c[: -len("_was_missing")]].isna().astype(float)
        for c in self.numeric_cols:  # training-statistic standardisation
            m, s = self.tabnet_stats_[c]
            out[c] = (out[c] - m) / s
        return out

    def tabnet_cat_info(self):
        """(cat_idxs, cat_dims) for TabNet, in transform_tabnet() column order."""
        cols = self.feature_cols + self.missing_indicator_cols_
        idxs = [cols.index(c) for c in self.categorical_cols]
        dims = [len(self.levels_[c]) for c in self.categorical_cols]
        return idxs, dims

    def to_dict(self):
        return {
            "feature_cols": self.feature_cols,
            "categorical_cols": self.categorical_cols,
            "numeric_cols": self.numeric_cols,
            "min_category_rows": self.min_category_rows,
            "medians": self.medians_,
            "missing_indicator_cols": self.missing_indicator_cols_,
            "tabnet_stats": self.tabnet_stats_,
            "levels": self.levels_,
            "group_maps": self.group_maps_,
            "label_maps": self.label_maps_,
        }

    @classmethod
    def from_dict(cls, d):
        obj = cls(d["feature_cols"], d["categorical_cols"], d["min_category_rows"])
        obj.medians_ = {k: float(v) for k, v in d["medians"].items()}
        obj.missing_indicator_cols_ = list(d["missing_indicator_cols"])
        obj.tabnet_stats_ = {k: [float(v[0]), float(v[1])] for k, v in d["tabnet_stats"].items()}
        obj.levels_ = d["levels"]
        obj.group_maps_ = d["group_maps"]
        obj.label_maps_ = d["label_maps"]
        return obj
