#!/bin/sh
# Baut und startet die Tests des Simulationskerns (ohne Unreal). Benötigt g++ oder clang++ mit C++20.
set -e
cd "$(dirname "$0")/.."
SRC=Source/WorldSim
${CXX:-g++} -std=c++20 -O1 -Wall -Wextra -I$SRC/Public $SRC/Private/Sim/*.cpp Tests/SimTests.cpp -o Tests/sim_tests
./Tests/sim_tests
