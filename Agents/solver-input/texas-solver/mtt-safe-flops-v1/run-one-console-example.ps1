$solverRoot = "C:\Users\stachal\Downloads\TexasSolver-v0.2.0-Windows\TexasSolver-v0.2.0-Windows"
$inputFile = "C:\Users\stachal\PKRTrainer\PKRTrainer\Agents\solver-input\texas-solver\mtt-safe-flops-v1\parameters\pkrtrainer_mtt_safe_flops_v1\01_MTT9_50BB_BTN_BB_SRP_A72r.txt"
Set-Location $solverRoot
.\console_solver.exe -i $inputFile
